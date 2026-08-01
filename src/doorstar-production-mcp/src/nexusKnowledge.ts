import { execFile } from "node:child_process";
import path from "node:path";
import { z } from "zod";

export const DEFAULT_NEXUS_MCP_URL = "http://100.82.133.87:3466/mcp";
export const DEFAULT_NEXUS_PRINCIPAL = "doorstar-root-codex";

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

const resultMetadataSchema = z.object({
  source: z.string().max(1_000).optional(),
  page: z.union([z.string(), z.number()]).optional(),
  doc: z.string().max(1_000).optional(),
  file_sha256: z.string().max(256).optional(),
  domain: z.string().max(500).optional(),
  title: z.string().max(2_000).optional(),
  category: z.string().max(500).optional(),
  chunk_index: z.number().int().nonnegative().optional(),
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
  const principal = (options.principal ?? environment.DOORSTAR_NEXUS_PRINCIPAL ?? DEFAULT_NEXUS_PRINCIPAL).trim();
  const tokenEnvironment = tokenEnvironmentForPrincipal(principal);
  // A configured but unknown principal must never fall back to the shared
  // compatibility credential.
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
      this.endpoint.hash
    ) {
      throw new NexusKnowledgeError("configuration");
    }

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
    if (normalizedQuery.length < 2 || normalizedQuery.length > 500 || !Number.isInteger(limit) || limit < 1 || limit > 10) {
      throw new NexusKnowledgeError("invalid_request");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
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
            arguments: { query: normalizedQuery, limit },
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
      return payload;
    } catch (error) {
      if (error instanceof NexusKnowledgeError) throw error;
      throw new NexusKnowledgeError("unavailable");
    } finally {
      // Keep the deadline active through the complete, size-bounded body read.
      clearTimeout(timeout);
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
