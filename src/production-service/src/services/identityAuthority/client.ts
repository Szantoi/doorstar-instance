import { z } from "zod";
import { snapshotIdentityAuthorityConfig, type IdentityAuthorityConfig, type IdentityAuthorityEnabledConfig } from "./config.js";
import { createPrivateKeyJwt, loadIdentityAuthorityPrivateKey, type PrivateKeyJwtDependencies } from "./privateKeyJwt.js";
import { parseIdentityAuthorityResolveRequest, parseIdentityAuthorityState, type IdentityAuthorityState } from "./contract.js";
import { readBoundedJsonResponseText, requireJsonContentType, parseStrictJsonObject } from "./strictJson.js";

const REQUEST_TIMEOUT_MILLISECONDS = 2_000;
const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1).max(16_384),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().min(1).max(300),
}).passthrough();

export type IdentityAuthorityResolution =
  | { readonly kind: "resolved"; readonly state: IdentityAuthorityState }
  | { readonly kind: "denied" }
  | { readonly kind: "unavailable"; readonly reason: "disabled" | "invalid_request" | "token_exchange_failed" | "resolver_unavailable" | "resolver_contract_invalid" };

export interface IdentityAuthorityResolverClient {
  resolve(value: unknown): Promise<IdentityAuthorityResolution>;
}

interface IdentityAuthorityClientTestDependencies extends PrivateKeyJwtDependencies {
  readonly fetch?: typeof globalThis.fetch;
  readonly loadPrivateKey?: typeof loadIdentityAuthorityPrivateKey;
  readonly environment?: NodeJS.ProcessEnv;
  readonly execArguments?: readonly string[];
}

/** Creates a server-only client. Nothing invokes this factory until a later composition slice wires it. */
export async function createIdentityAuthorityResolverClient(
  config: IdentityAuthorityConfig,
): Promise<IdentityAuthorityResolverClient> {
  return createIdentityAuthorityResolverClientWithDependencies(config, {
    fetch: globalThis.fetch,
    loadPrivateKey: loadIdentityAuthorityPrivateKey,
    environment: process.env,
    execArguments: process.execArgv,
  });
}

/**
 * Test seam only. Production composition must use createIdentityAuthorityResolverClient,
 * which owns the process transport and cannot receive caller-controlled security context.
 */
export async function createIdentityAuthorityResolverClientForTest(
  config: IdentityAuthorityConfig,
  dependencies: IdentityAuthorityClientTestDependencies = {},
): Promise<IdentityAuthorityResolverClient> {
  return createIdentityAuthorityResolverClientWithDependencies(config, dependencies);
}

async function createIdentityAuthorityResolverClientWithDependencies(
  config: IdentityAuthorityConfig,
  dependencies: IdentityAuthorityClientTestDependencies,
): Promise<IdentityAuthorityResolverClient> {
  const stableConfig = snapshotIdentityAuthorityConfig(config);
  if (stableConfig.mode === "disabled") return new DisabledIdentityAuthorityResolverClient();
  requireSafeTransportEnvironment(dependencies.environment ?? process.env, dependencies.execArguments ?? process.execArgv);

  const privateKey = await (dependencies.loadPrivateKey ?? loadIdentityAuthorityPrivateKey)(stableConfig.privateKeyPath);
  return new EnabledIdentityAuthorityResolverClient(
    stableConfig,
    privateKey,
    dependencies.fetch ?? globalThis.fetch,
    dependencies,
  );
}

class DisabledIdentityAuthorityResolverClient implements IdentityAuthorityResolverClient {
  public async resolve(_value: unknown): Promise<IdentityAuthorityResolution> {
    return { kind: "unavailable", reason: "disabled" };
  }
}

class EnabledIdentityAuthorityResolverClient implements IdentityAuthorityResolverClient {
  public constructor(
    private readonly config: IdentityAuthorityEnabledConfig,
    private readonly privateKey: Awaited<ReturnType<typeof loadIdentityAuthorityPrivateKey>>,
    private readonly fetchImplementation: typeof globalThis.fetch,
    private readonly assertionDependencies: PrivateKeyJwtDependencies,
  ) {}

  public async resolve(value: unknown): Promise<IdentityAuthorityResolution> {
    let request: ReturnType<typeof parseIdentityAuthorityResolveRequest>;
    try {
      request = parseIdentityAuthorityResolveRequest(value);
    } catch {
      return { kind: "unavailable", reason: "invalid_request" };
    }

    let accessToken: string;
    try {
      accessToken = await this.exchangeServiceToken();
    } catch {
      return { kind: "unavailable", reason: "token_exchange_failed" };
    }

    let deadlineResponse: DeadlineResponse;
    try {
      deadlineResponse = await fetchWithDeadline(this.fetchImplementation, this.config.resolverUrl, {
        method: "POST",
        redirect: "error",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ subject: request.subject, tenantId: request.tenantId }),
      });
    } catch {
      return { kind: "unavailable", reason: "resolver_unavailable" };
    }

    try {
      const response = deadlineResponse.response;
      if (response.status === 404) {
        deadlineResponse.abort();
        return { kind: "denied" };
      }
      if (response.status !== 200) {
        deadlineResponse.abort();
        return { kind: "unavailable", reason: "resolver_unavailable" };
      }
      requireJsonContentType(response);
      const state = parseIdentityAuthorityState(await readBoundedJsonResponseText(response));
      if (state.subject !== request.subject || state.tenantId !== request.tenantId) {
        return { kind: "unavailable", reason: "resolver_contract_invalid" };
      }
      if (state.tenantStatus !== "active" || state.membershipStatus !== "active") return { kind: "denied" };
      return { kind: "resolved", state };
    } catch (error) {
      return {
        kind: "unavailable",
        reason: deadlineResponse.timedOut() || !isProtocolFailure(error)
          ? "resolver_unavailable"
          : "resolver_contract_invalid",
      };
    } finally {
      deadlineResponse.abort();
      deadlineResponse.finish();
    }
  }

  private async exchangeServiceToken(): Promise<string> {
    const clientAssertion = createPrivateKeyJwt(this.config, this.privateKey, this.assertionDependencies);
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      scope: this.config.scope,
      client_assertion_type: CLIENT_ASSERTION_TYPE,
      client_assertion: clientAssertion,
    });
    const deadlineResponse = await fetchWithDeadline(this.fetchImplementation, this.config.tokenEndpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    try {
      const response = deadlineResponse.response;
      if (response.status !== 200) {
        deadlineResponse.abort();
        throw new Error("identity_authority_token_exchange_failed");
      }
      requireJsonContentType(response);
      const parsed = tokenResponseSchema.safeParse(parseStrictJsonObject(await readBoundedJsonResponseText(response)));
      if (!parsed.success) throw new Error("identity_authority_token_response_invalid");
      return parsed.data.access_token;
    } finally {
      deadlineResponse.abort();
      deadlineResponse.finish();
    }
  }
}

interface DeadlineResponse {
  readonly response: Response;
  abort(): void;
  timedOut(): boolean;
  finish(): void;
}

/** Rejects process-wide switches that could silently downgrade or redirect service-token transport. */
function requireSafeTransportEnvironment(environment: NodeJS.ProcessEnv, execArguments: readonly string[]): void {
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("identity_authority_insecure_tls_forbidden");
  }
  const proxyEnabled = environment.NODE_USE_ENV_PROXY?.toLowerCase() === "true"
    || environment.NODE_USE_ENV_PROXY === "1"
    || /use-env-proxy/u.test(environment.NODE_OPTIONS ?? "")
    || execArguments.some((argument) => argument === "--use-env-proxy" || argument.startsWith("--use-env-proxy="));
  if (proxyEnabled) throw new Error("identity_authority_implicit_proxy_forbidden");
}

function isProtocolFailure(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("identity_authority_");
}

async function fetchWithDeadline(
  fetchImplementation: typeof globalThis.fetch,
  input: string,
  init: RequestInit,
): Promise<DeadlineResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MILLISECONDS);
  try {
    const response = await fetchImplementation(input, { ...init, signal: controller.signal });
    return {
      response,
      abort: () => controller.abort(),
      timedOut: () => timedOut,
      finish: () => clearTimeout(timeout),
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}
