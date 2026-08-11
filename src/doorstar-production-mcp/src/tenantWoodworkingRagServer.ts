import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import { loadKnowledgeCorpus, searchKnowledge, type KnowledgeCorpus } from "./knowledge.js";

/**
 * This is a deliberately narrow tenant endpoint. It never opens a repository,
 * a document path, or an upstream URL: retrieval is limited to knowledge.ts's
 * static Doorstar woodworking corpus.
 */
export const DOORSTAR_TENANT_ID = "doorstar" as const;
export const DOORSTAR_WOODWORKING_SCOPE = "woodworking" as const;
export const DOORSTAR_WOODWORKING_COLLECTION = "doorstar-woodworking" as const;
export const DOORSTAR_WOODWORKING_PORT = 3467;
export const DOORSTAR_WOODWORKING_TAILNET_HOST = "100.82.133.87" as const;
export const DOORSTAR_WOODWORKING_CONFIG_FILE = "/opt/doorstar-woodworking-rag/agents.json" as const;

const DEFAULT_MCP_PROTOCOL_VERSION = "2025-03-26";
const SUPPORTED_MCP_PROTOCOL_VERSIONS = new Set(["2025-11-25", "2025-06-18", DEFAULT_MCP_PROTOCOL_VERSION]);
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_QUERY_LENGTH = 500;
const MAX_RESULT_LIMIT = 10;
const DEFAULT_RESULT_LIMIT = 5;
const TENANT_TOKEN_PATTERN = /^[a-f0-9]{96}$/;
export const TENANT_HEADERS_TIMEOUT_MS = 10_000;
export const TENANT_REQUEST_TIMEOUT_MS = 15_000;
export const TENANT_SOCKET_TIMEOUT_MS = 20_000;
export const TENANT_KEEP_ALIVE_TIMEOUT_MS = 5_000;
export const TENANT_MAX_CONNECTIONS = 64;
export const TENANT_MAX_REQUESTS_PER_SOCKET = 100;
export const TENANT_MAX_HEADER_COUNT = 32;

export const DOORSTAR_TENANT_WOODWORKING_AGENTS = [
  "doorstar-root-codex",
  "doorstar-conductor-codex",
  "doorstar-monitor-codex",
  "doorstar-backend-codex",
  "doorstar-frontend-codex",
  "doorstar-import-discovery-codex",
] as const;

const DOORSTAR_TENANT_WOODWORKING_AGENT_SET = new Set<string>(DOORSTAR_TENANT_WOODWORKING_AGENTS);

export type DoorstarTenantWoodworkingAgent = (typeof DOORSTAR_TENANT_WOODWORKING_AGENTS)[number];
export type JsonRpcId = string | number;

/** The only accepted authorization configuration: an opaque bearer token per
 * explicitly named Doorstar Codex principal. There is no default token or
 * master identity. */
export interface TenantWoodworkingRagConfig {
  readonly tenantId: typeof DOORSTAR_TENANT_ID;
  readonly scope: typeof DOORSTAR_WOODWORKING_SCOPE;
  readonly agents: Readonly<Record<string, DoorstarTenantWoodworkingAgent>>;
}

export interface TenantWoodworkingRagListenOptions {
  /** Defaults to the dedicated tenant Nexus port. Use 0 only in tests. */
  readonly port?: number;
  /** Defaults to loopback so a deployment must deliberately choose a wider bind. */
  readonly host?: string;
}

export interface StartedTenantWoodworkingRagServer {
  readonly server: Server;
  readonly config: TenantWoodworkingRagConfig;
  readonly corpusFingerprint: string;
  close(): Promise<void>;
}

export type TenantWoodworkingRagHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

export class TenantWoodworkingRagConfigError extends Error {
  constructor(message = "Invalid tenant woodworking RAG configuration.") {
    super(message);
    this.name = "TenantWoodworkingRagConfigError";
  }
}

class HttpRequestError extends Error {
  constructor(readonly statusCode: 400 | 413, message: string) {
    super(message);
  }
}

interface CorpusSnapshot {
  readonly corpus: KnowledgeCorpus;
  readonly fingerprint: string;
}

interface JsonRpcRequest {
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params: unknown;
}

interface JsonRpcRequestProblem {
  readonly code: -32700 | -32600;
  readonly message: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function configurationError(): never {
  throw new TenantWoodworkingRagConfigError();
}

function parseConfigurationJson(input: unknown): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch {
    configurationError();
  }
}

/**
 * Parses a JSON configuration without accepting aliases, fallbacks, default
 * principals, token environment variable names, or generic access roles.
 */
export function parseTenantWoodworkingRagConfig(input: unknown): TenantWoodworkingRagConfig {
  const value = parseConfigurationJson(input);
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["tenantId", "scope", "agents"])) configurationError();
  if (value.tenantId !== DOORSTAR_TENANT_ID || value.scope !== DOORSTAR_WOODWORKING_SCOPE || !isPlainRecord(value.agents)) {
    configurationError();
  }

  const configuredAgents = Object.entries(value.agents);
  if (configuredAgents.length !== DOORSTAR_TENANT_WOODWORKING_AGENTS.length) configurationError();

  const agents: Record<string, DoorstarTenantWoodworkingAgent> = Object.create(null) as Record<
    string,
    DoorstarTenantWoodworkingAgent
  >;
  const assignedPrincipals = new Set<string>();
  for (const [token, principal] of configuredAgents) {
    // Provisioning generates a 48-byte token as 96 lower-case hex digits.
    // Requiring that precise shape rejects weak hand-written credentials
    // before a Tailnet listener can start.
    if (!TENANT_TOKEN_PATTERN.test(token)) configurationError();
    if (typeof principal !== "string" || !DOORSTAR_TENANT_WOODWORKING_AGENT_SET.has(principal)) configurationError();
    // One current token per audited principal avoids an accidental shared or
    // catch-all credential. Rotation is an explicit, atomic config update.
    if (assignedPrincipals.has(principal)) configurationError();
    assignedPrincipals.add(principal);
    agents[token] = principal as DoorstarTenantWoodworkingAgent;
  }
  if (assignedPrincipals.size !== DOORSTAR_TENANT_WOODWORKING_AGENTS.length) configurationError();

  return Object.freeze({
    tenantId: DOORSTAR_TENANT_ID,
    scope: DOORSTAR_WOODWORKING_SCOPE,
    agents: Object.freeze(agents),
  });
}

function assertCorpusBoundary(corpus: KnowledgeCorpus): void {
  if (
    corpus.tenantId !== DOORSTAR_TENANT_ID ||
    corpus.scope !== DOORSTAR_WOODWORKING_SCOPE ||
    corpus.documentCount !== corpus.sources.length ||
    corpus.chunkCount !== corpus.chunks.length ||
    corpus.sources.some((source) => source.tenantId !== DOORSTAR_TENANT_ID || source.scope !== DOORSTAR_WOODWORKING_SCOPE)
  ) {
    throw new Error("The static tenant woodworking corpus did not meet its boundary.");
  }
}

/** The static corpus already owns the public version fingerprint. It is not a
 * filesystem path and is the same value the tenant bridge attests. */
export function corpusFingerprint(corpus: KnowledgeCorpus): string {
  assertCorpusBoundary(corpus);
  if (!/^doorstar-woodworking-v1-[a-f0-9]{16}$/.test(corpus.corpusVersion)) {
    throw new Error("The static tenant woodworking corpus did not provide its expected fingerprint.");
  }
  return corpus.corpusVersion;
}

async function loadCorpusSnapshot(): Promise<CorpusSnapshot> {
  const corpus = await loadKnowledgeCorpus();
  return Object.freeze({ corpus, fingerprint: corpusFingerprint(corpus) });
}

function jsonBody(response: ServerResponse, statusCode: number, body: unknown): void {
  if (response.writableEnded || response.destroyed) return;
  const text = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(text, "utf8"),
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(text);
}

function jsonRpcError(
  response: ServerResponse,
  id: JsonRpcId | null,
  code: -32700 | -32600 | -32601 | -32602 | -32003,
  message: string,
  statusCode = 200
): void {
  jsonBody(response, statusCode, { jsonrpc: "2.0", id, error: { code, message } });
}

function isJsonContentType(request: IncomingMessage): boolean {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string") return false;
  const [mimeType, ...parameters] = contentType.split(";");
  if (mimeType?.trim().toLowerCase() !== "application/json") return false;
  return parameters.every((parameter) => parameter.trim().length > 0);
}

function declaredBodyLength(request: IncomingMessage): number | undefined {
  const header = request.headers["content-length"];
  if (header === undefined) return undefined;
  if (typeof header !== "string" || !/^(?:0|[1-9]\d*)$/.test(header)) {
    throw new HttpRequestError(400, "Malformed request body.");
  }
  const length = Number(header);
  if (!Number.isSafeInteger(length)) throw new HttpRequestError(400, "Malformed request body.");
  if (length > MAX_REQUEST_BYTES) throw new HttpRequestError(413, "Request body is too large.");
  return length;
}

async function readJsonRequestBody(request: IncomingMessage): Promise<unknown> {
  if (!isJsonContentType(request)) throw new HttpRequestError(400, "Expected a JSON request body.");
  declaredBodyLength(request);

  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += buffer.length;
      if (length > MAX_REQUEST_BYTES) throw new HttpRequestError(413, "Request body is too large.");
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof HttpRequestError) throw error;
    throw new HttpRequestError(400, "Malformed request body.");
  }
  if (length === 0) throw new HttpRequestError(400, "Expected a JSON request body.");

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, length));
  } catch {
    throw new HttpRequestError(400, "Malformed request body.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpRequestError(400, "Malformed request body.");
  }
}

function parseJsonRpcRequest(value: unknown): JsonRpcRequest | JsonRpcRequestProblem {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["jsonrpc", "id", "method", "params"])) {
    return { code: -32600, message: "Invalid JSON-RPC request." };
  }
  if (value.jsonrpc !== "2.0" || typeof value.method !== "string" || value.method.length === 0 || value.method.length > 128) {
    return { code: -32600, message: "Invalid JSON-RPC request." };
  }
  if (!hasOwn(value, "id") || !isJsonRpcId(value.id)) return { code: -32600, message: "Invalid JSON-RPC request." };
  return { id: value.id, method: value.method, params: value.params };
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
}

function isJsonRpcRequestProblem(value: JsonRpcRequest | JsonRpcRequestProblem): value is JsonRpcRequestProblem {
  return "code" in value;
}

function isEmptyParams(value: unknown): boolean {
  return value === undefined || (isPlainRecord(value) && Object.keys(value).length === 0);
}

function negotiatedProtocolVersion(params: unknown): string | undefined {
  if (params === undefined) return DEFAULT_MCP_PROTOCOL_VERSION;
  if (!isPlainRecord(params) || !hasOnlyKeys(params, ["protocolVersion", "capabilities", "clientInfo"])) return undefined;

  const requestedVersion = params.protocolVersion;
  if (requestedVersion !== undefined && (typeof requestedVersion !== "string" || requestedVersion.length === 0 || requestedVersion.length > 64)) {
    return undefined;
  }
  if (params.capabilities !== undefined && !isPlainRecord(params.capabilities)) return undefined;
  if (params.clientInfo !== undefined) {
    if (!isPlainRecord(params.clientInfo) || typeof params.clientInfo.name !== "string" || typeof params.clientInfo.version !== "string") {
      return undefined;
    }
    if (
      params.clientInfo.name.length === 0 ||
      params.clientInfo.name.length > 256 ||
      params.clientInfo.version.length === 0 ||
      params.clientInfo.version.length > 128
    ) {
      return undefined;
    }
  }
  return typeof requestedVersion === "string" && SUPPORTED_MCP_PROTOCOL_VERSIONS.has(requestedVersion)
    ? requestedVersion
    : DEFAULT_MCP_PROTOCOL_VERSION;
}

function readToolsList(): { tools: readonly [Record<string, unknown>] } {
  return {
    tools: [
      {
        name: "search_knowledge",
        title: "Doorstar woodworking knowledge search",
        description: "Read-only search of the fixed Doorstar woodworking corpus.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string", minLength: 2, maxLength: MAX_QUERY_LENGTH },
            limit: { type: "integer", minimum: 1, maximum: MAX_RESULT_LIMIT },
          },
          required: ["query"],
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
    ],
  };
}

interface SearchToolArguments {
  readonly query: string;
  readonly limit: number;
}

/** `domain` is intentionally omitted from tools/list. The fixed upstream
 * bridge may send it as an attestation guard, but callers cannot select a
 * different domain. */
function parseSearchToolArguments(value: unknown): SearchToolArguments | undefined {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["query", "limit", "domain"])) return undefined;
  if (typeof value.query !== "string") return undefined;
  const query = value.query.trim();
  if (query.length < 2 || query.length > MAX_QUERY_LENGTH || /[\u0000-\u001f\u007f]/.test(query)) return undefined;
  const suppliedLimit = value.limit;
  if (
    suppliedLimit !== undefined &&
    (typeof suppliedLimit !== "number" ||
      !Number.isSafeInteger(suppliedLimit) ||
      suppliedLimit < 1 ||
      suppliedLimit > MAX_RESULT_LIMIT)
  ) {
    return undefined;
  }
  if (value.domain !== undefined && value.domain !== DOORSTAR_WOODWORKING_SCOPE) return undefined;
  return { query, limit: suppliedLimit ?? DEFAULT_RESULT_LIMIT };
}

function cardIdFromSyntheticSource(source: string): string {
  const prefix = "tenant:doorstar;scope:woodworking;card:";
  if (!source.startsWith(prefix)) {
    throw new Error("The static tenant woodworking corpus returned an invalid card reference.");
  }
  const cardId = source.slice(prefix.length);
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(cardId)) {
    throw new Error("The static tenant woodworking corpus returned an invalid card reference.");
  }
  return cardId;
}

function createSearchPayload(snapshot: CorpusSnapshot, query: string, limit: number) {
  const results = searchKnowledge(snapshot.corpus, query, limit).map((result) => ({
    score: result.score,
    text: result.excerpt,
    metadata: {
      source: result.source.path,
      cardId: cardIdFromSyntheticSource(result.source.path),
      title: result.source.title,
      section: result.section,
      domain: DOORSTAR_WOODWORKING_SCOPE,
      tenantId: DOORSTAR_TENANT_ID,
      scope: DOORSTAR_WOODWORKING_SCOPE,
      provenance: result.source.provenance,
      sha256: result.source.sha256,
    },
  }));

  // Keep this shape fixed: callers receive a scoped RAG response, not a
  // generalized corpus, file, network, repository, or development-data API.
  return {
    query,
    limit,
    island: DOORSTAR_TENANT_ID,
    domain: DOORSTAR_WOODWORKING_SCOPE,
    collection: DOORSTAR_WOODWORKING_COLLECTION,
    scope: DOORSTAR_WOODWORKING_SCOPE,
    corpusFingerprint: snapshot.fingerprint,
    count: results.length,
    results,
  };
}

function exactAuthorizationValues(request: IncomingMessage): string[] {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === "authorization") values.push(request.rawHeaders[index + 1] ?? "");
  }
  // Native IncomingMessage always has rawHeaders. This fallback keeps the
  // exported handler usable with a minimal in-memory request double.
  if (values.length === 0 && request.rawHeaders.length === 0 && typeof request.headers.authorization === "string") {
    values.push(request.headers.authorization);
  }
  return values;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function hasExactBearerAuthorization(request: IncomingMessage, agents: TenantWoodworkingRagConfig["agents"]): boolean {
  const headers = exactAuthorizationValues(request);
  if (headers.length !== 1) return false;

  const suppliedHeader = headers[0] ?? "";
  let matched = 0;
  for (const token of Object.keys(agents)) {
    // Evaluate every configured credential to avoid selecting a default role
    // and to keep the server unaware of caller-specific behavior.
    matched |= Number(constantTimeEqual(suppliedHeader, `Bearer ${token}`));
  }
  return matched === 1;
}

function discardRequest(request: IncomingMessage): void {
  request.resume();
}

function healthPayload(config: TenantWoodworkingRagConfig, snapshot: CorpusSnapshot) {
  return {
    status: "ok",
    collectionName: DOORSTAR_WOODWORKING_COLLECTION,
    tenantId: config.tenantId,
    scope: config.scope,
    corpusFingerprint: snapshot.fingerprint,
    documents: snapshot.corpus.documentCount,
    port: DOORSTAR_WOODWORKING_PORT,
  };
}

async function handleMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: TenantWoodworkingRagConfig,
  snapshot: CorpusSnapshot
): Promise<void> {
  if (!hasExactBearerAuthorization(request, config.agents)) {
    discardRequest(request);
    jsonBody(response, 401, { error: "unauthorized" });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonRequestBody(request);
  } catch (error) {
    const problem = error instanceof HttpRequestError ? error : new HttpRequestError(400, "Malformed request body.");
    jsonRpcError(response, null, -32700, problem.message, problem.statusCode);
    return;
  }

  const rpcRequest = parseJsonRpcRequest(body);
  if (isJsonRpcRequestProblem(rpcRequest)) {
    jsonRpcError(response, null, rpcRequest.code, rpcRequest.message, 400);
    return;
  }

  if (rpcRequest.method === "initialize") {
    const protocolVersion = negotiatedProtocolVersion(rpcRequest.params);
    if (!protocolVersion) {
      jsonRpcError(response, rpcRequest.id, -32602, "Invalid initialize parameters.");
      return;
    }
    jsonBody(response, 200, {
      jsonrpc: "2.0",
      id: rpcRequest.id,
      result: {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "doorstar-tenant-woodworking-rag", version: "1.0.0" },
      },
    });
    return;
  }

  if (rpcRequest.method === "tools/list") {
    if (!isEmptyParams(rpcRequest.params)) {
      jsonRpcError(response, rpcRequest.id, -32602, "Invalid tools/list parameters.");
      return;
    }
    jsonBody(response, 200, { jsonrpc: "2.0", id: rpcRequest.id, result: readToolsList() });
    return;
  }

  if (rpcRequest.method === "tools/call") {
    if (!isPlainRecord(rpcRequest.params) || !hasOnlyKeys(rpcRequest.params, ["name", "arguments"]) || typeof rpcRequest.params.name !== "string") {
      jsonRpcError(response, rpcRequest.id, -32602, "Invalid tools/call parameters.");
      return;
    }
    if (rpcRequest.params.name !== "search_knowledge") {
      // The live bridge treats this status/code pair as an authorization
      // boundary: unlisted tools must be forbidden rather than merely absent.
      jsonRpcError(response, rpcRequest.id, -32003, "Tool access is forbidden.", 403);
      return;
    }
    const argumentsValue = parseSearchToolArguments(rpcRequest.params.arguments);
    if (!argumentsValue) {
      jsonRpcError(response, rpcRequest.id, -32602, "Invalid search_knowledge arguments.");
      return;
    }
    const payload = createSearchPayload(snapshot, argumentsValue.query, argumentsValue.limit);
    jsonBody(response, 200, {
      jsonrpc: "2.0",
      id: rpcRequest.id,
      result: { content: [{ type: "text", text: JSON.stringify(payload) }] },
    });
    return;
  }

  jsonRpcError(response, rpcRequest.id, -32601, "Method not found.");
}

async function createRuntime(configuration: unknown): Promise<{
  readonly config: TenantWoodworkingRagConfig;
  readonly snapshot: CorpusSnapshot;
  readonly handler: TenantWoodworkingRagHandler;
}> {
  const config = parseTenantWoodworkingRagConfig(configuration);
  const snapshot = await loadCorpusSnapshot();
  const handler: TenantWoodworkingRagHandler = async (request, response) => {
    try {
      const requestUrl = request.url;
      if (request.method === "GET" && requestUrl === "/health") {
        // Health is part of the tenant attestation contract, not a public
        // discovery endpoint. Keep its collection/fingerprint metadata behind
        // the same six-principal bearer boundary as the MCP tool.
        if (!hasExactBearerAuthorization(request, config.agents)) {
          discardRequest(request);
          jsonBody(response, 401, { error: "unauthorized" });
          return;
        }
        jsonBody(response, 200, healthPayload(config, snapshot));
        return;
      }
      if (request.method === "POST" && requestUrl === "/mcp") {
        await handleMcpRequest(request, response, config, snapshot);
        return;
      }
      discardRequest(request);
      jsonBody(response, request.method === "GET" || request.method === "POST" ? 404 : 405, { error: "not_found" });
    } catch {
      // Never disclose a path, source, request body, token, or stack trace.
      jsonBody(response, 500, { error: "internal_error" });
    }
  };
  return Object.freeze({ config, snapshot, handler });
}

/** Create a testable Node HTTP handler without starting a listening socket. */
export async function createTenantWoodworkingRagHandler(configuration: unknown): Promise<TenantWoodworkingRagHandler> {
  return (await createRuntime(configuration)).handler;
}

function validatedListenPort(value: number | undefined): number {
  const port = value ?? DOORSTAR_WOODWORKING_PORT;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new TenantWoodworkingRagConfigError("Invalid tenant woodworking RAG listen port.");
  }
  return port;
}

/** Start the fixed-scope server. The default loopback bind makes broader
 * exposure an explicit deployment choice; no hostname is ever fetched. */
export async function startTenantWoodworkingRagServer(
  configuration: unknown,
  options: TenantWoodworkingRagListenOptions = {}
): Promise<StartedTenantWoodworkingRagServer> {
  const runtime = await createRuntime(configuration);
  const server = createServer((request, response) => {
    void runtime.handler(request, response);
  });
  // The endpoint is reachable across the Tailnet, so retain only a small
  // bounded HTTP surface even before request-level validation runs. These
  // values protect against incomplete headers, slow bodies, idle sockets and
  // connection hoarding without changing the single-tool MCP contract.
  server.headersTimeout = TENANT_HEADERS_TIMEOUT_MS;
  server.requestTimeout = TENANT_REQUEST_TIMEOUT_MS;
  server.timeout = TENANT_SOCKET_TIMEOUT_MS;
  server.keepAliveTimeout = TENANT_KEEP_ALIVE_TIMEOUT_MS;
  server.maxConnections = TENANT_MAX_CONNECTIONS;
  server.maxRequestsPerSocket = TENANT_MAX_REQUESTS_PER_SOCKET;
  server.maxHeadersCount = TENANT_MAX_HEADER_COUNT;
  const port = validatedListenPort(options.port);
  const host = options.host ?? "127.0.0.1";
  if (typeof host !== "string" || host.length === 0 || host.length > 255 || /[\u0000-\u001f\u007f]/.test(host)) {
    throw new TenantWoodworkingRagConfigError("Invalid tenant woodworking RAG listen host.");
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host, port });
  });

  return Object.freeze({
    server,
    config: runtime.config,
    corpusFingerprint: runtime.snapshot.fingerprint,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  });
}

export interface ProductionTenantWoodworkingConfigurationOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly readConfigurationFile?: (filePath: string) => Promise<string>;
}

/**
 * Production never accepts the tenant token map through an environment value:
 * systemd environment and process listings are not a credential store. The
 * fixed root-owned file is the only permitted runtime configuration source.
 */
export async function loadProductionTenantWoodworkingConfiguration(
  options: ProductionTenantWoodworkingConfigurationOptions = {}
): Promise<string> {
  const environment = options.environment ?? process.env;
  const configurationFile = environment.DOORSTAR_TENANT_WOODWORKING_RAG_CONFIG_FILE;
  if (
    configurationFile !== DOORSTAR_WOODWORKING_CONFIG_FILE ||
    environment.DOORSTAR_TENANT_WOODWORKING_RAG_CONFIG_JSON !== undefined
  ) {
    throw new TenantWoodworkingRagConfigError("Required tenant woodworking RAG runtime configuration is missing.");
  }

  try {
    const text = await (options.readConfigurationFile ?? ((filePath) => readFile(filePath, "utf8")))(configurationFile);
    if (Buffer.byteLength(text, "utf8") > MAX_REQUEST_BYTES) {
      throw new TenantWoodworkingRagConfigError("Invalid tenant woodworking RAG runtime configuration.");
    }
    return text;
  } catch (error) {
    if (error instanceof TenantWoodworkingRagConfigError) throw error;
    throw new TenantWoodworkingRagConfigError("Invalid tenant woodworking RAG runtime configuration.");
  }
}

function parseEnvironmentPort(value: string): number {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new TenantWoodworkingRagConfigError("Invalid tenant woodworking RAG listen port.");
  return validatedListenPort(Number(value));
}

/**
 * The executable deployment is deliberately narrower than the testable HTTP
 * factory: it must only ever expose the tenant through its assigned Tailnet
 * address and port. This prevents an accidental systemd/environment edit from
 * making the private corpus listen on a public or wildcard interface.
 */
export function productionListenOptions(environment: NodeJS.ProcessEnv = process.env): Required<TenantWoodworkingRagListenOptions> {
  const port = parseEnvironmentPort(environment.DOORSTAR_TENANT_WOODWORKING_RAG_PORT ?? String(DOORSTAR_WOODWORKING_PORT));
  const host = environment.DOORSTAR_TENANT_WOODWORKING_RAG_HOST;
  if (host !== DOORSTAR_WOODWORKING_TAILNET_HOST || port !== DOORSTAR_WOODWORKING_PORT) {
    throw new TenantWoodworkingRagConfigError("Invalid tenant woodworking RAG production listen endpoint.");
  }
  return { host, port };
}

/** Minimal process entry point for nexus-dev. It requires the complete JSON
 * configuration and has no environment/default identity fallback. */
export async function main(): Promise<void> {
  const configuration = await loadProductionTenantWoodworkingConfiguration();
  await startTenantWoodworkingRagServer(configuration, productionListenOptions());
  console.error("Doorstar woodworking tenant RAG listening on configured Tailnet endpoint.");
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (executedPath === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Do not echo configuration, bearer tokens, or parser details to logs.
    console.error("Doorstar tenant woodworking RAG server could not start.");
    process.exitCode = 1;
  });
}
