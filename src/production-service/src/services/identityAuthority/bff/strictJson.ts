/**
 * Strict JSON parser for security-sensitive BFF material. Unlike the resolver
 * parser, this scanner rejects duplicate decoded keys at every object depth
 * before JSON.parse can collapse them.
 */
export const DOORSTAR_BFF_STRICT_JSON_MAXIMUM_BYTES = 64 * 1_024;
export const DOORSTAR_BFF_STRICT_JSON_MAXIMUM_DEPTH = 32;
const DOORSTAR_BFF_STRICT_JSON_HARD_MAXIMUM_DEPTH = 64;

export interface DoorstarStrictJsonLimits {
  readonly maximumBytes?: number;
  readonly maximumDepth?: number;
}

export interface DoorstarFullDepthStrictJsonObject {
  readonly value: Record<string, unknown>;
  /** Raw root primitive tokens retained only for canonical numeric contracts. */
  readonly rootPrimitiveLexemes: ReadonlyMap<string, string>;
}

/** Parses one full-depth duplicate-safe JSON object from a raw UTF-8 value. */
export function parseDoorstarFullDepthStrictJsonObject(
  value: unknown,
  limits: DoorstarStrictJsonLimits = {},
): Record<string, unknown> {
  return parseDoorstarFullDepthStrictJsonObjectWithMetadata(value, limits).value;
}

/** Parses one object and retains exact root primitive wire lexemes for callers that need them. */
export function parseDoorstarFullDepthStrictJsonObjectWithMetadata(
  value: unknown,
  limits: DoorstarStrictJsonLimits = {},
): DoorstarFullDepthStrictJsonObject {
  const maximumBytes = resolvePositiveLimit(limits.maximumBytes, DOORSTAR_BFF_STRICT_JSON_MAXIMUM_BYTES,
    DOORSTAR_BFF_STRICT_JSON_MAXIMUM_BYTES);
  const maximumDepth = resolvePositiveLimit(limits.maximumDepth, DOORSTAR_BFF_STRICT_JSON_MAXIMUM_DEPTH,
    DOORSTAR_BFF_STRICT_JSON_HARD_MAXIMUM_DEPTH);
  const text = decodeInput(value, maximumBytes);
  try {
    const scanner = new FullDepthJsonScanner(text, maximumDepth);
    scanner.scan();
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("doorstar_bff_json_root_must_be_object");
    }
    return Object.freeze({
      value: parsed as Record<string, unknown>,
      rootPrimitiveLexemes: new Map(scanner.rootPrimitiveLexemes),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("doorstar_bff_json_")) throw error;
    throw new Error("doorstar_bff_json_invalid");
  }
}

/** Decodes a bounded byte sequence with fatal UTF-8 validation. */
export function decodeDoorstarStrictUtf8(value: unknown, maximumBytes: number): string {
  if (!(value instanceof Uint8Array)
    || !isPositiveLimit(maximumBytes, DOORSTAR_BFF_STRICT_JSON_MAXIMUM_BYTES)
    || value.byteLength > maximumBytes) {
    throw new Error("doorstar_bff_json_input_invalid");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new Error("doorstar_bff_json_utf8_invalid");
  }
}

function decodeInput(value: unknown, maximumBytes: number): string {
  if (value instanceof Uint8Array) return decodeDoorstarStrictUtf8(value, maximumBytes);
  if (typeof value !== "string" || containsUnpairedSurrogate(value)) {
    throw new Error("doorstar_bff_json_input_invalid");
  }
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength > maximumBytes) throw new Error("doorstar_bff_json_input_invalid");
  const decoded = decodeDoorstarStrictUtf8(bytes, maximumBytes);
  if (decoded !== value) throw new Error("doorstar_bff_json_utf8_invalid");
  return decoded;
}

function resolvePositiveLimit(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!isPositiveLimit(value, maximum)) throw new Error("doorstar_bff_json_limit_invalid");
  return value;
}

function isPositiveLimit(value: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}

function containsUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      if (index + 1 >= value.length) return true;
      const next = value.charCodeAt(index + 1);
      if (next < 0xDC00 || next > 0xDFFF) return true;
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      return true;
    }
  }
  return false;
}

class FullDepthJsonScanner {
  private index = 0;
  private readonly rootLexemes = new Map<string, string>();

  public constructor(
    private readonly text: string,
    private readonly maximumDepth: number,
  ) {}

  public scan(): void {
    this.skipWhitespace();
    this.scanObject(1);
    this.skipWhitespace();
    if (this.index !== this.text.length) this.fail();
  }

  public get rootPrimitiveLexemes(): ReadonlyMap<string, string> {
    return this.rootLexemes;
  }

  private scanObject(depth: number): void {
    this.requireDepth(depth);
    this.expect("{");
    this.skipWhitespace();
    if (this.consume("}")) return;

    const keys = new Set<string>();
    while (true) {
      this.skipWhitespace();
      const key = this.scanString();
      if (keys.has(key)) throw new Error("doorstar_bff_json_duplicate_key");
      keys.add(key);
      this.skipWhitespace();
      this.expect(":");
      this.scanValue(depth + 1, depth === 1 ? key : undefined);
      this.skipWhitespace();
      if (this.consume("}")) return;
      this.expect(",");
    }
  }

  private scanArray(depth: number): void {
    this.requireDepth(depth);
    this.expect("[");
    this.skipWhitespace();
    if (this.consume("]")) return;
    while (true) {
      this.scanValue(depth + 1);
      this.skipWhitespace();
      if (this.consume("]")) return;
      this.expect(",");
    }
  }

  private scanValue(depth: number, rootKey?: string): void {
    this.skipWhitespace();
    const character = this.text[this.index];
    if (character === "{") return this.scanObject(depth);
    if (character === "[") return this.scanArray(depth);
    if (character === "\"") {
      this.scanString();
      return;
    }
    const lexeme = this.scanPrimitive();
    if (rootKey !== undefined) this.rootLexemes.set(rootKey, lexeme);
  }

  private scanPrimitive(): string {
    const start = this.index;
    while (this.index < this.text.length && !/[\s,\]}]/u.test(this.text[this.index]!)) this.index += 1;
    if (this.index === start) this.fail();
    return this.text.slice(start, this.index);
  }

  private scanString(): string {
    const start = this.index;
    this.expect("\"");
    while (this.index < this.text.length) {
      const character = this.text[this.index++]!;
      if (character === "\"") {
        const raw = this.text.slice(start, this.index);
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "string") this.fail();
        return parsed;
      }
      if (character === "\\") {
        if (this.index >= this.text.length) this.fail();
        this.index += 1;
      } else if (character.charCodeAt(0) < 0x20) {
        this.fail();
      }
    }
    this.fail();
  }

  private requireDepth(depth: number): void {
    if (depth > this.maximumDepth) throw new Error("doorstar_bff_json_depth_exceeded");
  }

  private skipWhitespace(): void {
    while (this.index < this.text.length && /\s/u.test(this.text[this.index]!)) this.index += 1;
  }

  private consume(character: string): boolean {
    if (this.text[this.index] !== character) return false;
    this.index += 1;
    return true;
  }

  private expect(character: string): void {
    if (!this.consume(character)) this.fail();
  }

  private fail(): never {
    throw new Error("doorstar_bff_json_invalid");
  }
}
