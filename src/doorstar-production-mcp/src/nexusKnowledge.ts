import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { loadKnowledgeCorpus, searchKnowledge, type KnowledgeCorpus, type KnowledgeSearchResult } from "./knowledge.js";
import { tenantWoodworkingDocuments, type TenantWoodworkingDocument } from "./tenantWoodworkingKnowledge.js";

/**
 * Dedicated, tailnet-only Doorstar tenant endpoint. It is intentionally not
 * the broad Nexus-dev corpus on port 3466: this service owns exactly the
 * `doorstar-woodworking` corpus.
 */
export const DEFAULT_NEXUS_MCP_URL = "http://100.82.133.87:3467/mcp";
export const DOORSTAR_WOODWORKING_COLLECTION = "doorstar-woodworking";
export const DOORSTAR_WOODWORKING_SCOPE = "woodworking";

/**
 * Nexus principals are deliberately mapped to a fixed token-variable name.
 * A custom agent may select only one of these principals; it cannot ask the
 * bridge to read an arbitrary environment or registry value.
 */
export const NEXUS_PRINCIPAL_TOKEN_ENVIRONMENT = {
  "doorstar-root-codex": "DOORSTAR_NEXUS_ROOT_TOKEN",
  "doorstar-conductor-codex": "DOORSTAR_NEXUS_CONDUCTOR_TOKEN",
  "doorstar-monitor-codex": "DOORSTAR_NEXUS_MONITOR_TOKEN",
  "doorstar-backend-codex": "DOORSTAR_NEXUS_BACKEND_TOKEN",
  "doorstar-frontend-codex": "DOORSTAR_NEXUS_FRONTEND_TOKEN",
  "doorstar-import-discovery-codex": "DOORSTAR_NEXUS_IMPORT_DISCOVERY_TOKEN",
} as const;

export type NexusPrincipal = keyof typeof NEXUS_PRINCIPAL_TOKEN_ENVIRONMENT;
export type NexusTokenEnvironmentVariable = (typeof NEXUS_PRINCIPAL_TOKEN_ENVIRONMENT)[NexusPrincipal];

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MIN_TOKEN_LENGTH = 32;

const cardIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,127}$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const corpusFingerprintSchema = z.string().regex(/^doorstar-woodworking-v1-[a-f0-9]{16}$/);

interface TrustedTenantCard {
  readonly id: string;
  readonly source: string;
  readonly title: string;
  readonly section: string;
  readonly text: string;
  readonly sha256: string;
}

interface TrustedTenantManifest {
  readonly corpus: KnowledgeCorpus;
  readonly corpusFingerprint: string;
  readonly documentCount: number;
  readonly cardsById: ReadonlyMap<string, TrustedTenantCard>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function tenantCardSource(cardId: string): string {
  return `tenant:doorstar;scope:woodworking;card:${cardId}`;
}

/**
 * This value is derived from the checked-in static tenant manifest, not from
 * anything the remote service says. A tenant that was reconfigured to point
 * at a broader corpus therefore cannot satisfy the bridge merely by using a
 * similarly shaped fingerprint.
 */
export const DOORSTAR_WOODWORKING_CORPUS_FINGERPRINT = `doorstar-woodworking-v1-${sha256(
  tenantWoodworkingDocuments.map((document) => `${tenantCardSource(document.id)}:${document.sha256}`).join("\n")
).slice(0, 16)}`;

function staticTenantConfigurationError(): never {
  throw new NexusKnowledgeError("configuration");
}

function trustedCardFromDocument(document: TenantWoodworkingDocument): TrustedTenantCard {
  if (
    !cardIdSchema.safeParse(document.id).success ||
    document.domain !== DOORSTAR_WOODWORKING_SCOPE ||
    document.tenantId !== "doorstar" ||
    document.scope !== DOORSTAR_WOODWORKING_SCOPE ||
    document.provenance !== "doorstar-tenant-curated-static" ||
    !sha256Schema.safeParse(document.sha256).success
  ) {
    staticTenantConfigurationError();
  }
  return Object.freeze({
    id: document.id,
    source: tenantCardSource(document.id),
    title: document.title,
    section: document.section,
    text: document.text,
    sha256: document.sha256,
  });
}

/**
 * Build the local trust root once. The remote tenant remains useful for
 * identity and MCP transport, but it is not authoritative for corpus
 * membership, provenance, text, or versioning.
 */
async function loadTrustedTenantManifest(): Promise<TrustedTenantManifest> {
  if (tenantWoodworkingDocuments.length === 0) staticTenantConfigurationError();

  const cardsById = new Map<string, TrustedTenantCard>();
  for (const document of tenantWoodworkingDocuments) {
    const card = trustedCardFromDocument(document);
    if (cardsById.has(card.id)) staticTenantConfigurationError();
    cardsById.set(card.id, card);
  }

  const corpus = await loadKnowledgeCorpus();
  if (
    corpus.corpusVersion !== DOORSTAR_WOODWORKING_CORPUS_FINGERPRINT ||
    corpus.documentCount !== tenantWoodworkingDocuments.length ||
    corpus.chunkCount !== tenantWoodworkingDocuments.length ||
    corpus.sources.length !== tenantWoodworkingDocuments.length ||
    corpus.chunks.length !== tenantWoodworkingDocuments.length ||
    corpus.tenantId !== "doorstar" ||
    corpus.scope !== DOORSTAR_WOODWORKING_SCOPE ||
    corpus.provenance !== "doorstar-tenant-curated-static"
  ) {
    staticTenantConfigurationError();
  }

  for (const card of cardsById.values()) {
    const sources = corpus.sources.filter((source) => source.path === card.source);
    const chunks = corpus.chunks.filter((chunk) => chunk.source.path === card.source);
    const source = sources[0];
    const chunk = chunks[0];
    if (
      sources.length !== 1 ||
      chunks.length !== 1 ||
      !source ||
      !chunk ||
      source.title !== card.title ||
      source.sha256 !== card.sha256 ||
      source.tenantId !== "doorstar" ||
      source.scope !== DOORSTAR_WOODWORKING_SCOPE ||
      source.provenance !== "doorstar-tenant-curated-static" ||
      chunk.section !== card.section ||
      chunk.text !== card.text ||
      chunk.source !== source
    ) {
      staticTenantConfigurationError();
    }
  }

  return Object.freeze({
    corpus,
    corpusFingerprint: DOORSTAR_WOODWORKING_CORPUS_FINGERPRINT,
    documentCount: tenantWoodworkingDocuments.length,
    cardsById,
  });
}

let trustedTenantManifestPromise: Promise<TrustedTenantManifest> | undefined;

function trustedTenantManifest(): Promise<TrustedTenantManifest> {
  trustedTenantManifestPromise ??= loadTrustedTenantManifest();
  return trustedTenantManifestPromise;
}

/**
 * The upstream tenant returns a deliberately small, synthetic provenance
 * shape. Rejecting all book/page/filesystem fields makes an accidental return
 * from the former broad development corpus fail closed.
 */
const resultMetadataSchema = z
  .object({
    source: z.string().regex(/^tenant:doorstar;scope:woodworking;card:[a-z0-9][a-z0-9-]{0,127}$/),
    cardId: cardIdSchema,
    title: z.string().min(1).max(2_000),
    section: z.string().min(1).max(500),
    domain: z.literal(DOORSTAR_WOODWORKING_SCOPE),
    tenantId: z.literal("doorstar"),
    scope: z.literal(DOORSTAR_WOODWORKING_SCOPE),
    provenance: z.literal("doorstar-tenant-curated-static"),
    sha256: sha256Schema,
  })
  .superRefine((metadata, context) => {
    if (!metadata.source.endsWith(`card:${metadata.cardId}`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The synthetic source does not match its card identifier.",
      });
    }
  });

const searchResultSchema = z.object({
  text: z.string().max(128_000),
  metadata: resultMetadataSchema,
  score: z.number().finite().optional(),
});

const searchPayloadSchema = z
  .object({
    query: z.string(),
    limit: z.number().int().min(1).max(10),
    island: z.literal("doorstar"),
    domain: z.literal(DOORSTAR_WOODWORKING_SCOPE),
    collection: z.literal(DOORSTAR_WOODWORKING_COLLECTION),
    scope: z.literal(DOORSTAR_WOODWORKING_SCOPE),
    corpusFingerprint: corpusFingerprintSchema,
    count: z.number().int().nonnegative().max(10),
    results: z.array(searchResultSchema).max(10),
  })
  .superRefine((payload, context) => {
    if (payload.count !== payload.results.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The result count does not match the result list.",
      });
    }
  });

const healthPayloadSchema = z.object({
  status: z.literal("ok"),
  collectionName: z.literal(DOORSTAR_WOODWORKING_COLLECTION),
  tenantId: z.literal("doorstar"),
  scope: z.literal(DOORSTAR_WOODWORKING_SCOPE),
  corpusFingerprint: corpusFingerprintSchema,
  documents: z.number().int().min(1).max(500),
  port: z.literal(3467),
});

const jsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.literal(1),
  result: z.object({
    isError: z.literal(false).optional(),
    content: z
      .array(
        z.object({
          type: z.literal("text"),
          text: z.string(),
        })
      )
      .min(1),
  }),
});

export type NexusKnowledgeSearch = z.infer<typeof searchPayloadSchema>;
export type NexusFetch = typeof fetch;
export type NexusKnowledgeErrorKind =
  | "configuration"
  | "invalid_request"
  | "unauthorized"
  | "unavailable"
  | "invalid_response";

export class NexusKnowledgeError extends Error {
  constructor(public readonly kind: NexusKnowledgeErrorKind) {
    super(kind);
  }
}

export interface NexusKnowledgeClientOptions {
  /** Test-only dependency injection; the production bridge always uses the fixed default URL. */
  endpoint?: string;
  token?: string;
  fetchImplementation?: NexusFetch;
  timeoutMs?: number;
}

export interface NexusTokenResolutionOptions {
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  principal?: string;
  readWindowsUserEnvironment?: (variableName: NexusTokenEnvironmentVariable) => Promise<string | undefined>;
}

export function tokenEnvironmentForPrincipal(principal: string): NexusTokenEnvironmentVariable | undefined {
  if (!Object.prototype.hasOwnProperty.call(NEXUS_PRINCIPAL_TOKEN_ENVIRONMENT, principal)) return undefined;
  return NEXUS_PRINCIPAL_TOKEN_ENVIRONMENT[principal as NexusPrincipal];
}

/**
 * Resolve the dedicated token without placing it in configuration or argv.
 *
 * Codex desktop can keep a background host alive across a UI restart. Such a
 * host does not automatically inherit a newly persisted Windows user variable,
 * so the bridge falls back to the current user's HKCU environment value. The
 * registry command output stays in memory and is never written to MCP output
 * or diagnostics.
 */
export async function resolveNexusToken(options: NexusTokenResolutionOptions = {}): Promise<string | undefined> {
  const environment = options.environment ?? process.env;
  const requestedPrincipal = options.principal ?? environment.DOORSTAR_NEXUS_PRINCIPAL;
  if (typeof requestedPrincipal !== "string") return undefined;
  const principal = requestedPrincipal.trim();
  const tokenEnvironment = tokenEnvironmentForPrincipal(principal);
  // A missing or unknown principal must never become an implicit root/default
  // identity. Every bridge is explicitly bound in its Codex configuration.
  if (!tokenEnvironment) return undefined;

  const inherited = environment[tokenEnvironment];
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") return inherited;

  // The persisted user value is authoritative on Windows so token rotation
  // also works when a long-lived background host still carries an older copy.
  const readUserEnvironment = options.readWindowsUserEnvironment ?? readWindowsUserToken;
  const persisted = await readUserEnvironment(tokenEnvironment);
  return persisted?.trim() || inherited;
}

function readWindowsUserToken(variableName: NexusTokenEnvironmentVariable): Promise<string | undefined> {
  return new Promise((resolve) => {
    const systemRoot = process.env.SystemRoot;
    if (!systemRoot || !path.win32.isAbsolute(systemRoot)) {
      resolve(undefined);
      return;
    }
    const registryExecutable = path.win32.join(systemRoot, "System32", "reg.exe");
    execFile(
      registryExecutable,
      ["query", "HKCU\\Environment", "/v", variableName],
      { encoding: "utf8", windowsHide: true, timeout: 3_000, maxBuffer: 8_192 },
      (error, stdout) => {
        if (error) {
          resolve(undefined);
          return;
        }
        resolve(parseWindowsUserEnvironmentToken(stdout, variableName));
      }
    );
  });
}

export function parseWindowsUserEnvironmentToken(
  stdout: string,
  variableName: NexusTokenEnvironmentVariable = "DOORSTAR_NEXUS_ROOT_TOKEN"
): string | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 3 || columns[0] !== variableName) continue;
    if (columns[1] !== "REG_SZ" && columns[1] !== "REG_EXPAND_SZ") return undefined;
    return columns.slice(2).join(" ").trim() || undefined;
  }
  return undefined;
}

/**
 * Narrow, read-only client for the legacy Nexus JSON-RPC endpoint.
 *
 * The agent can supply only a query and a bounded result count. Identity,
 * island and collection selection remain server-side consequences of the
 * dedicated bearer token and can never be forwarded from MCP tool input.
 */
export class NexusKnowledgeClient {
  private readonly endpoint: URL;
  private readonly healthEndpoint: URL;
  private readonly token: string;
  private readonly fetchImplementation: NexusFetch;
  private readonly timeoutMs: number;

  constructor(options: NexusKnowledgeClientOptions = {}) {
    const rawEndpoint = options.endpoint ?? DEFAULT_NEXUS_MCP_URL;
    try {
      this.endpoint = new URL(rawEndpoint);
    } catch {
      throw new NexusKnowledgeError("configuration");
    }
    if (
      (this.endpoint.protocol !== "http:" && this.endpoint.protocol !== "https:") ||
      this.endpoint.username ||
      this.endpoint.password ||
      this.endpoint.hash ||
      this.endpoint.pathname !== "/mcp"
    ) {
      throw new NexusKnowledgeError("configuration");
    }
    this.healthEndpoint = new URL("/health", this.endpoint);

    const token = options.token;
    if (!token || token.length < MIN_TOKEN_LENGTH || /\s/.test(token)) {
      throw new NexusKnowledgeError("configuration");
    }
    this.token = token;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 60_000) {
      throw new NexusKnowledgeError("configuration");
    }
  }

  async search(query: string, limit = 5): Promise<NexusKnowledgeSearch> {
    const normalizedQuery = query.trim();
    if (
      normalizedQuery.length < 2 ||
      normalizedQuery.length > 500 ||
      /[\u0000-\u001f\u007f]/.test(normalizedQuery) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 10
    ) {
      throw new NexusKnowledgeError("invalid_request");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      // Establish the checked-in corpus as the trust root before sending a
      // request. This does not read the user-provided book directory or any
      // repository content; it builds only the static tenant cards.
      const trustedManifest = await trustedTenantManifest();
      await this.verifyTenantHealth(controller.signal, trustedManifest);
      const response = await this.fetchImplementation(this.endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "search_knowledge",
            // The agent never controls this filter. The dedicated collection
            // is authoritative; this is a second, server-enforced guard.
            arguments: { query: normalizedQuery, limit, domain: DOORSTAR_WOODWORKING_SCOPE },
          },
        }),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new NexusKnowledgeError("unauthorized");
      }
      if (!response.ok) {
        throw new NexusKnowledgeError("unavailable");
      }
      const contentType = response.headers.get("content-type")?.toLowerCase();
      if (!contentType?.includes("application/json")) {
        throw new NexusKnowledgeError("invalid_response");
      }

      const responseText = await readBoundedResponse(response);
      let rpcResponse: z.infer<typeof jsonRpcResponseSchema>;
      try {
        rpcResponse = jsonRpcResponseSchema.parse(JSON.parse(responseText));
      } catch {
        throw new NexusKnowledgeError("invalid_response");
      }

      const textContent = rpcResponse.result.content[0]?.text;
      let payload: NexusKnowledgeSearch;
      try {
        payload = searchPayloadSchema.parse(JSON.parse(textContent));
      } catch {
        throw new NexusKnowledgeError("invalid_response");
      }
      if (payload.query !== normalizedQuery || payload.limit !== limit) {
        throw new NexusKnowledgeError("invalid_response");
      }
      this.verifyTrustedSearchPayload(payload, normalizedQuery, limit, trustedManifest);
      return payload;
    } catch (error) {
      if (error instanceof NexusKnowledgeError) throw error;
      throw new NexusKnowledgeError("unavailable");
    } finally {
      // Keep the deadline active through the complete, size-bounded body read.
      clearTimeout(timeout);
    }
  }

  private verifyTrustedSearchPayload(
    payload: NexusKnowledgeSearch,
    query: string,
    limit: number,
    trustedManifest: TrustedTenantManifest
  ): void {
    if (payload.corpusFingerprint !== trustedManifest.corpusFingerprint) {
      throw new NexusKnowledgeError("invalid_response");
    }

    // The remote tenant must return exactly the bounded static search result
    // selected by the same pinned corpus. In particular, a valid-looking
    // card ID cannot be used to smuggle source-book text, code, or a result
    // from another chunk.
    const expectedResults = searchKnowledge(trustedManifest.corpus, query, limit);
    if (payload.results.length !== expectedResults.length) {
      throw new NexusKnowledgeError("invalid_response");
    }
    for (let index = 0; index < expectedResults.length; index += 1) {
      const expected = expectedResults[index];
      const received = payload.results[index];
      if (!expected || !received || !this.isTrustedResult(received, expected, trustedManifest)) {
        throw new NexusKnowledgeError("invalid_response");
      }
    }
  }

  private isTrustedResult(
    result: NexusKnowledgeSearch["results"][number],
    expected: KnowledgeSearchResult,
    trustedManifest: TrustedTenantManifest
  ): boolean {
    const card = trustedManifest.cardsById.get(result.metadata.cardId);
    if (!card || expected.source.path !== card.source) return false;
    if (
      result.metadata.source !== card.source ||
      result.metadata.title !== card.title ||
      result.metadata.section !== card.section ||
      result.metadata.sha256 !== card.sha256
    ) {
      return false;
    }
    // Scores can influence how an agent weighs evidence. When the tenant
    // returns one, it must be the score recomputed from the pinned corpus;
    // scoreless responses remain compatible with the narrow MCP contract.
    if (result.score !== undefined && result.score !== expected.score) return false;

    // The server's excerpt function is deterministic over the same pinned
    // static chunk. Requiring its exact output prevents a valid card label
    // from carrying arbitrary source-book or development text.
    return result.text === expected.excerpt;
  }

  private async verifyTenantHealth(signal: AbortSignal, trustedManifest: TrustedTenantManifest): Promise<void> {
    const response = await this.fetchImplementation(this.healthEndpoint, {
      method: "GET",
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new NexusKnowledgeError("unauthorized");
    }
    if (!response.ok) {
      throw new NexusKnowledgeError("unavailable");
    }
    const contentType = response.headers.get("content-type")?.toLowerCase();
    if (!contentType?.includes("application/json")) {
      throw new NexusKnowledgeError("invalid_response");
    }
    try {
      const health = healthPayloadSchema.parse(JSON.parse(await readBoundedResponse(response)));
      if (
        health.corpusFingerprint !== trustedManifest.corpusFingerprint ||
        health.documents !== trustedManifest.documentCount
      ) {
        throw new NexusKnowledgeError("invalid_response");
      }
    } catch (error) {
      if (error instanceof NexusKnowledgeError) throw error;
      throw new NexusKnowledgeError("invalid_response");
    }
  }
}

async function readBoundedResponse(response: Response): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_RESPONSE_BYTES) {
      throw new NexusKnowledgeError("invalid_response");
    }
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new NexusKnowledgeError("invalid_response");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), receivedBytes).toString("utf8");
}
