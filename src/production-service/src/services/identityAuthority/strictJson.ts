/** The service accepts only small JSON documents and rejects duplicate root keys before parsing. */
export const IDENTITY_AUTHORITY_MAX_RESPONSE_BYTES = 64 * 1024;

/** Reads an HTTP response with a hard byte cap before decoding it as UTF-8 JSON. */
export async function readBoundedJsonResponseText(
  response: Response,
  maximumBytes = IDENTITY_AUTHORITY_MAX_RESPONSE_BYTES,
): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > maximumBytes) {
      throw new Error("identity_authority_response_body_too_large");
    }
  }

  if (response.body === null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) {
      throw new Error("identity_authority_response_body_too_large");
    }
    return decodeUtf8(bytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new Error("identity_authority_response_body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decodeUtf8(bytes);
}

/** Rejects a response whose media type cannot safely be parsed as the agreed JSON contract. */
export function requireJsonContentType(response: Response): void {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new Error("identity_authority_response_content_type_invalid");
}

/** Parses one root JSON object and rejects duplicate root property names before JSON.parse can erase them. */
export function parseStrictJsonObject(text: string): Record<string, unknown> {
  try {
    new JsonObjectScanner(text).scan();
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("identity_authority_json_root_must_be_object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("identity_authority_")) throw error;
    throw new Error("identity_authority_json_invalid");
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("identity_authority_response_utf8_invalid");
  }
}

class JsonObjectScanner {
  private index = 0;

  public constructor(private readonly text: string) {}

  public scan(): void {
    this.skipWhitespace();
    this.scanObject(true);
    this.skipWhitespace();
    if (this.index !== this.text.length) this.fail();
  }

  private scanObject(trackRootKeys: boolean): void {
    this.expect("{");
    this.skipWhitespace();
    if (this.consume("}")) return;

    const keys = new Set<string>();
    while (true) {
      this.skipWhitespace();
      const key = this.scanString();
      if (trackRootKeys) {
        if (keys.has(key)) throw new Error("identity_authority_json_duplicate_key");
        keys.add(key);
      }
      this.skipWhitespace();
      this.expect(":");
      this.scanValue();
      this.skipWhitespace();
      if (this.consume("}")) return;
      this.expect(",");
    }
  }

  private scanArray(): void {
    this.expect("[");
    this.skipWhitespace();
    if (this.consume("]")) return;
    while (true) {
      this.scanValue();
      this.skipWhitespace();
      if (this.consume("]")) return;
      this.expect(",");
    }
  }

  private scanValue(): void {
    this.skipWhitespace();
    const character = this.text[this.index];
    if (character === "{") return this.scanObject(false);
    if (character === "[") return this.scanArray();
    if (character === "\"") {
      this.scanString();
      return;
    }
    this.scanPrimitive();
  }

  private scanPrimitive(): void {
    const start = this.index;
    while (this.index < this.text.length && !/[\s,\]}]/u.test(this.text[this.index]!)) this.index += 1;
    if (this.index === start) this.fail();
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
    throw new Error("identity_authority_json_invalid");
  }
}
