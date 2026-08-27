import { validatePilotBffConfig, type PilotBffConfig } from "../config/pilotBffConfig.js";
import type { Clock } from "../ports/clock.js";
import type { PilotCrypto } from "../ports/crypto.js";
import type { PilotAuthLogger } from "../ports/logger.js";
import type { OidcAuthorizationClient } from "../ports/oidc.js";
import type {
  AuthorizationTransactionRepository,
  OpaqueSessionRepository,
  PilotBindingRepository,
  PilotScopeRepository,
} from "../ports/repositories.js";
import { dispatchPilotAuthRequest } from "../http/route.js";
import type { PilotHttpRequest, PilotHttpResponse } from "../http/contracts.js";
import { PilotAuthService } from "./authService.js";

export type PilotBffDependencies = Readonly<{
  config: PilotBffConfig;
  clock: Clock;
  crypto: PilotCrypto;
  oidc: OidcAuthorizationClient;
  transactions: AuthorizationTransactionRepository;
  bindings: PilotBindingRepository;
  sessions: OpaqueSessionRepository;
  scopes: PilotScopeRepository;
  logger: PilotAuthLogger;
}>;

export type PilotBff = Readonly<{
  config: PilotBffConfig;
  handle(request: PilotHttpRequest): Promise<PilotHttpResponse>;
}>;

/**
 * Call and await this during composition startup, before a Node HTTP listener
 * is opened. The sole configured scope is captured once and transactions stay
 * scope-neutral; only binding and session operations receive that scope.
 */
export async function createPilotBff(dependencies: PilotBffDependencies): Promise<PilotBff> {
  const config = validatePilotBffConfig(dependencies.config);
  const fixedScope = await dependencies.scopes.requireSingleConfiguredScope({
    scopeKey: config.fixedScopeKey,
  });
  if (!fixedScope.id || fixedScope.scopeKey !== config.fixedScopeKey) {
    throw new Error("pilot_bff_scope_preflight_invalid");
  }

  const auth = new PilotAuthService({
    config,
    fixedScope,
    clock: dependencies.clock,
    crypto: dependencies.crypto,
    oidc: dependencies.oidc,
    transactions: dependencies.transactions,
    bindings: dependencies.bindings,
    sessions: dependencies.sessions,
    logger: dependencies.logger,
  });
  dependencies.logger.info("pilot_bff_scope_preflight_passed", {
    scopeKey: fixedScope.scopeKey,
  });

  return Object.freeze({
    config,
    handle: (request) => dispatchPilotAuthRequest(request, config, auth),
  });
}
