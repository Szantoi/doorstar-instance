import type { PilotBffConfig } from "../config/pilotBffConfig.js";
import {
  pilotOfficeRoles,
  type DirectRosterBindingProvision,
  type DirectRosterBindingUpdate,
  type PilotOfficeRole,
  type ResolvedPilotScope,
} from "../domain/model.js";
import type {
  NewPilotRosterUserRequest,
  PilotRosterUser,
  UpdatePilotRosterUserRequest,
} from "../domain/roster.js";
import type { Clock } from "../ports/clock.js";
import type { PilotCrypto } from "../ports/crypto.js";
import type { PilotDirectoryAdmin } from "../ports/directory.js";
import type { PilotAuthLogger } from "../ports/logger.js";
import type { PilotRosterReader, PilotRosterWriter } from "../ports/repositories.js";
import { PilotRosterAdminError } from "./errors.js";
import type { PilotAuthService } from "./authService.js";

const officeRoleSet = new Set<string>(pilotOfficeRoles);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256HexPattern = /^[a-f0-9]{64}$/;
const opaquePattern = /^[A-Za-z0-9_-]{32,512}$/;

export type PilotRosterAdminServiceDependencies = Readonly<{
  config: PilotBffConfig;
  fixedScope: ResolvedPilotScope;
  clock: Clock;
  crypto: PilotCrypto;
  auth: PilotAuthService;
  rosterReader: PilotRosterReader;
  rosterWriter: PilotRosterWriter;
  directory: PilotDirectoryAdmin;
  logger: PilotAuthLogger;
}>;

/**
 * Named-user administrator workflow. It accepts only a session cookie value
 * plus validated display/policy fields; the directory subject, actor key,
 * scope, actor and audit correlation are all generated or resolved here.
 */
export class PilotRosterAdminService {
  public constructor(private readonly dependencies: PilotRosterAdminServiceDependencies) {}

  public async listUsers(sessionToken: string | undefined): Promise<readonly PilotRosterUser[]> {
    const actorSessionTokenHash = await this.requireEffectiveRosterManager(sessionToken);
    try {
      return await this.dependencies.rosterReader.listDirectAdminBindings({
        pilotScopeId: this.dependencies.fixedScope.id,
        actorSessionTokenHash,
      });
    } catch {
      this.dependencies.logger.warn("pilot_roster_list_unavailable", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
      });
      throw new PilotRosterAdminError(503, "roster_list_unavailable");
    }
  }

  public async createUser(
    sessionToken: string | undefined,
    input: NewPilotRosterUserRequest,
  ): Promise<PilotRosterUser> {
    const actorSessionTokenHash = await this.requireEffectiveRosterManager(sessionToken);
    const request = validateNewRosterUserRequest(input);

    let directoryAccount: Readonly<{ subject: string }> | undefined;
    try {
      directoryAccount = await this.dependencies.directory.createAccountAndSendInvitation({
        email: request.email,
        displayName: request.displayName,
      });
      directoryAccount = { subject: requireDirectorySubject(directoryAccount.subject) };
    } catch {
      await this.compensateDirectoryAccount(directoryAccount);
      this.dependencies.logger.warn("pilot_roster_directory_unavailable", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
      });
      throw new PilotRosterAdminError(503, "roster_directory_unavailable");
    }

    let user: PilotRosterUser;
    try {
      const provision: DirectRosterBindingProvision = {
        pilotScopeId: this.dependencies.fixedScope.id,
        actorSessionTokenHash,
        issuer: this.dependencies.config.oidc.issuer,
        subjectDigest: requireSha256Hex(
          this.dependencies.crypto.digestOidcSubject(
            this.dependencies.config.oidc.issuer,
            directoryAccount.subject,
          ),
          "roster_subject_digest_invalid",
        ),
        actorKey: requireSha256Hex(
          this.dependencies.crypto.hash(this.createActorKeySeed()),
          "roster_actor_key_invalid",
        ),
        displayName: request.displayName,
        role: request.role,
        canManagePilotRoster: request.canManagePilotRoster,
        correlationId: this.createCorrelationId(),
      };
      user = await this.dependencies.rosterWriter.provisionDirectAdminBinding(provision);
    } catch {
      await this.compensateDirectoryAccount(directoryAccount);
      this.dependencies.logger.warn("pilot_roster_provision_unavailable", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
      });
      throw new PilotRosterAdminError(503, "roster_provision_unavailable");
    }

    try {
      await this.dependencies.directory.enableCreatedAccount(directoryAccount);
    } catch {
      // If the enable request may have reached Keycloak before its response
      // failed, first make the directory account unavailable again. The
      // database update then revokes the just-created local access binding.
      await this.compensateDirectoryAccount(directoryAccount);
      await this.compensateProvisionedBinding(actorSessionTokenHash, user);
      this.dependencies.logger.warn("pilot_roster_enable_unavailable", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
      });
      throw new PilotRosterAdminError(503, "roster_enable_unavailable");
    }

    this.dependencies.logger.info("pilot_roster_user_provisioned", {
      scopeKey: this.dependencies.fixedScope.scopeKey,
    });
    return user;
  }

  public async updateUser(
    sessionToken: string | undefined,
    bindingId: string,
    input: UpdatePilotRosterUserRequest,
  ): Promise<PilotRosterUser> {
    const actorSessionTokenHash = await this.requireEffectiveRosterManager(sessionToken);
    const request = validateUpdateRosterUserRequest(input);
    const update: DirectRosterBindingUpdate = {
      pilotScopeId: this.dependencies.fixedScope.id,
      actorSessionTokenHash,
      targetBindingId: requireUuid(bindingId, "roster_binding_id_invalid"),
      expectedAuditVersion: request.expectedAuditVersion,
      role: request.role,
      active: request.active,
      canManagePilotRoster: request.canManagePilotRoster,
      // This is server-owned fixed audit context, never a browser field.
      reason: "admin-roster-policy-update",
      correlationId: this.createCorrelationId(),
    };
    try {
      const user = await this.dependencies.rosterWriter.updateDirectAdminBinding(update);
      this.dependencies.logger.info("pilot_roster_user_updated", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
      });
      return user;
    } catch {
      this.dependencies.logger.warn("pilot_roster_update_unavailable", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
      });
      throw new PilotRosterAdminError(503, "roster_update_unavailable");
    }
  }

  private async requireEffectiveRosterManager(sessionToken: string | undefined): Promise<string> {
    let session;
    try {
      session = await this.dependencies.auth.getSession(sessionToken);
    } catch {
      this.dependencies.logger.warn("pilot_roster_authentication_unavailable", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
      });
      throw new PilotRosterAdminError(503, "roster_authentication_unavailable");
    }
    if (!session) {
      throw new PilotRosterAdminError(401, "roster_authentication_required");
    }

    const actorSessionTokenHash = requireSha256Hex(
      this.dependencies.crypto.hash(sessionToken as string),
      "roster_session_hash_invalid",
    );
    try {
      const manager = await this.dependencies.rosterReader.findEffectiveManagerBySessionTokenHash({
        pilotScopeId: this.dependencies.fixedScope.id,
        sessionTokenHash: actorSessionTokenHash,
        observedAt: this.now(),
      });
      if (
        !manager
        || manager.pilotScopeId !== this.dependencies.fixedScope.id
        || manager.bindingId !== session.bindingId
      ) {
        throw new PilotRosterAdminError(403, "roster_manager_required");
      }
      return actorSessionTokenHash;
    } catch (error) {
      if (error instanceof PilotRosterAdminError) {
        throw error;
      }
      this.dependencies.logger.warn("pilot_roster_authorization_unavailable", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
      });
      throw new PilotRosterAdminError(503, "roster_authorization_unavailable");
    }
  }

  private createActorKeySeed(): string {
    const value = this.dependencies.crypto.createOpaqueSecret("actor_key");
    if (!opaquePattern.test(value)) {
      throw new Error("roster_actor_key_seed_invalid");
    }
    return value;
  }

  private createCorrelationId(): string {
    const value = this.dependencies.crypto.createCorrelationId();
    if (typeof value !== "string" || !uuidPattern.test(value)) {
      throw new Error("roster_correlation_id_invalid");
    }
    return value;
  }

  private async compensateDirectoryAccount(
    directoryAccount: Readonly<{ subject: string }> | undefined,
  ): Promise<void> {
    if (!directoryAccount) {
      return;
    }
    try {
      await this.dependencies.directory.disableCreatedAccount(directoryAccount);
    } catch {
      this.dependencies.logger.error("pilot_roster_directory_compensation_unavailable", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
      });
    }
  }

  private async compensateProvisionedBinding(
    actorSessionTokenHash: string,
    user: PilotRosterUser,
  ): Promise<void> {
    try {
      await this.dependencies.rosterWriter.updateDirectAdminBinding({
        pilotScopeId: this.dependencies.fixedScope.id,
        actorSessionTokenHash,
        targetBindingId: user.bindingId,
        expectedAuditVersion: user.auditVersion,
        role: user.role,
        active: false,
        canManagePilotRoster: user.canManagePilotRoster,
        // Fixed server-owned audit context; never a browser field.
        reason: "admin-roster-directory-enable-failed",
        correlationId: this.createCorrelationId(),
      });
    } catch {
      this.dependencies.logger.error("pilot_roster_binding_compensation_unavailable", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
      });
    }
  }

  private now(): Date {
    const value = this.dependencies.clock.now();
    if (Number.isNaN(value.getTime())) {
      throw new Error("roster_clock_invalid");
    }
    return new Date(value.getTime());
  }
}

function validateNewRosterUserRequest(input: NewPilotRosterUserRequest): NewPilotRosterUserRequest {
  return {
    displayName: requireSafeText(input?.displayName, 160, "roster_display_name_invalid"),
    email: requireSafeEmail(input?.email),
    role: requireOfficeRole(input?.role),
    canManagePilotRoster: requireBoolean(
      input?.canManagePilotRoster,
      "roster_manage_capability_invalid",
    ),
  };
}

function validateUpdateRosterUserRequest(
  input: UpdatePilotRosterUserRequest,
): UpdatePilotRosterUserRequest {
  const expectedAuditVersion = input?.expectedAuditVersion;
  if (!Number.isSafeInteger(expectedAuditVersion) || expectedAuditVersion < 1 || expectedAuditVersion > 2_147_483_647) {
    throw new PilotRosterAdminError(400, "roster_audit_version_invalid");
  }
  return {
    expectedAuditVersion,
    role: requireOfficeRole(input?.role),
    active: requireBoolean(input?.active, "roster_active_invalid"),
    canManagePilotRoster: requireBoolean(
      input?.canManagePilotRoster,
      "roster_manage_capability_invalid",
    ),
  };
}

function requireSafeEmail(value: unknown): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 254
    || value !== value.trim()
    || /[\r\n\u0000]/.test(value)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    throw new PilotRosterAdminError(400, "roster_email_invalid");
  }
  return value;
}

function requireSafeText(value: unknown, maximumLength: number, code: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximumLength
    || value !== value.trim()
    || /[\r\n\u0000]/.test(value)
  ) {
    throw new PilotRosterAdminError(400, code);
  }
  return value;
}

function requireOfficeRole(value: unknown): PilotOfficeRole {
  if (typeof value !== "string" || !officeRoleSet.has(value)) {
    throw new PilotRosterAdminError(400, "roster_role_invalid");
  }
  return value as PilotOfficeRole;
}

function requireBoolean(value: unknown, code: string): boolean {
  if (typeof value !== "boolean") {
    throw new PilotRosterAdminError(400, code);
  }
  return value;
}

function requireUuid(value: unknown, code: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new PilotRosterAdminError(400, code);
  }
  return value;
}

function requireSha256Hex(value: unknown, code: string): string {
  if (typeof value !== "string" || !sha256HexPattern.test(value)) {
    throw new Error(code);
  }
  return value;
}

function requireDirectorySubject(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
    throw new Error("roster_directory_subject_invalid");
  }
  return value;
}
