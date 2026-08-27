import { randomBytes, randomUUID } from "node:crypto";

import {
  normalizeHex64,
  normalizeUuid,
  validateBootstrapCommand,
  type BootstrapCommand,
  type BootstrapCommandResult,
  type PilotOfficeRole,
} from "../domain/bootstrapCommand.js";

export type BootstrapProvisionInvocation = Readonly<{
  issuer: string;
  subjectDigest: string;
  actorKey: string;
  displayName: string;
  role: PilotOfficeRole;
  canManagePilotRoster: boolean;
  approvalReference: string;
  correlationId: string;
}>;

export type BootstrapRevokeInvocation = Readonly<{
  bindingId: string;
  expectedAuditVersion: number;
  approvalReference: string;
  correlationId: string;
}>;

/** Narrow port: no direct-admin, session or generic query capability leaks upward. */
export interface PilotBootstrapDatabase {
  preflight(): Promise<void>;
  provision(input: BootstrapProvisionInvocation): Promise<string>;
  revoke(input: BootstrapRevokeInvocation): Promise<string>;
  close(): Promise<void>;
}

export interface BootstrapRandom {
  hex64(): string;
  uuid(): string;
}

export const nodeBootstrapRandom: BootstrapRandom = Object.freeze({
  hex64: () => randomBytes(32).toString("hex"),
  uuid: () => randomUUID(),
});

/**
 * The service generates all sensitive operation identifiers in the process
 * boundary. It never returns or logs the bootstrap actor key.
 */
export class PilotBootstrapService {
  public constructor(
    private readonly database: PilotBootstrapDatabase,
    private readonly random: BootstrapRandom = nodeBootstrapRandom,
  ) {}

  public async execute(command: BootstrapCommand): Promise<BootstrapCommandResult> {
    const validated = validateBootstrapCommand(command);
    if (validated.kind === "preflight") {
      await this.database.preflight();
      return Object.freeze({ kind: "preflight" });
    }

    if (validated.kind === "provision") {
      const actorKey = normalizeHex64(this.random.hex64(), "generated_actor_key_invalid");
      const correlationId = normalizeUuid(this.random.uuid(), "generated_correlation_id_invalid");
      const bindingId = normalizeUuid(
        await this.database.provision({
          issuer: validated.issuer,
          subjectDigest: validated.subjectDigest,
          actorKey,
          displayName: validated.displayName,
          role: validated.role,
          canManagePilotRoster: validated.canManagePilotRoster,
          approvalReference: validated.approvalReference,
          correlationId,
        }),
        "bootstrap_provision_result_invalid",
      );
      return Object.freeze({ kind: "provision", bindingId, correlationId });
    }

    const correlationId = normalizeUuid(this.random.uuid(), "generated_correlation_id_invalid");
    const bindingId = normalizeUuid(
      await this.database.revoke({
        bindingId: validated.bindingId,
        expectedAuditVersion: validated.expectedAuditVersion,
        approvalReference: validated.approvalReference,
        correlationId,
      }),
      "bootstrap_revoke_result_invalid",
    );
    return Object.freeze({ kind: "revoke", bindingId, correlationId });
  }
}
