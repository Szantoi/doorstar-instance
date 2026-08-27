/**
 * Provisionable Doorstar Office roles. The immutable F PostgreSQL enum also
 * retains historical SHOP_FLOOR vocabulary, but that Plant authority is not
 * accepted by this bootstrap surface.
 */
export const pilotOfficeRoles = [
  "SALES",
  "TECHNICAL_PREPARATION",
  "ORDER_APPROVER",
  "PRODUCTION_PLANNER",
  "INSTALLER",
  "WAREHOUSE_DISPATCH",
  "ADMINISTRATOR",
  "READER",
] as const;

export type PilotOfficeRole = typeof pilotOfficeRoles[number];

export type BootstrapCommand =
  | Readonly<{ kind: "preflight" }>
  | Readonly<{
      kind: "provision";
      issuer: string;
      subjectDigest: string;
      displayName: string;
      role: PilotOfficeRole;
      canManagePilotRoster: boolean;
      approvalReference: string;
    }>
  | Readonly<{
      kind: "revoke";
      bindingId: string;
      expectedAuditVersion: number;
      approvalReference: string;
    }>;

export type BootstrapCommandResult =
  | Readonly<{ kind: "preflight" }>
  | Readonly<{ kind: "provision"; bindingId: string; correlationId: string }>
  | Readonly<{ kind: "revoke"; bindingId: string; correlationId: string }>;

export class BootstrapCommandInputError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "BootstrapCommandInputError";
  }
}

const hex64Pattern = /^[a-fA-F0-9]{64}$/;
const uuidPattern = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;
const controlCharacterPattern = /[\u0000\r\n]/;
const roleSet = new Set<string>(pilotOfficeRoles);

/** Parses the intentionally small `--name value` command-line surface. */
export function parseBootstrapCommand(argv: readonly string[]): BootstrapCommand {
  const [operation, ...flagTokens] = argv;
  if (operation === undefined) {
    throw new BootstrapCommandInputError("operation_required");
  }

  if (operation === "preflight") {
    if (flagTokens.length !== 0) {
      throw new BootstrapCommandInputError("preflight_accepts_no_options");
    }
    return Object.freeze({ kind: "preflight" });
  }

  if (operation === "provision") {
    const options = parseOptions(flagTokens, [
      "issuer",
      "subject-digest",
      "display-name",
      "role",
      "can-manage-pilot-roster",
      "approval-reference",
    ]);
    return validateBootstrapCommand({
      kind: "provision",
      issuer: requiredOption(options, "issuer"),
      subjectDigest: requiredOption(options, "subject-digest"),
      displayName: requiredOption(options, "display-name"),
      role: requiredOption(options, "role") as PilotOfficeRole,
      canManagePilotRoster: parseBoolean(requiredOption(options, "can-manage-pilot-roster")),
      approvalReference: requiredOption(options, "approval-reference"),
    });
  }

  if (operation === "revoke") {
    const options = parseOptions(flagTokens, [
      "binding-id",
      "expected-audit-version",
      "approval-reference",
    ]);
    return validateBootstrapCommand({
      kind: "revoke",
      bindingId: requiredOption(options, "binding-id"),
      expectedAuditVersion: parsePositiveInteger(
        requiredOption(options, "expected-audit-version"),
      ),
      approvalReference: requiredOption(options, "approval-reference"),
    });
  }

  throw new BootstrapCommandInputError("operation_not_allowed");
}

/** Revalidates programmatic callers; TypeScript types are not a security boundary. */
export function validateBootstrapCommand(command: BootstrapCommand): BootstrapCommand {
  if (command.kind === "preflight") {
    return Object.freeze({ kind: "preflight" });
  }

  if (command.kind === "provision") {
    const issuer = normalizeHttpsIssuer(command.issuer);
    const subjectDigest = normalizeHex64(command.subjectDigest, "subject_digest_invalid");
    const displayName = normalizeText(command.displayName, 160, "display_name_invalid");
    if (!roleSet.has(command.role)) {
      throw new BootstrapCommandInputError("role_not_allowed");
    }
    if (typeof command.canManagePilotRoster !== "boolean") {
      throw new BootstrapCommandInputError("can_manage_pilot_roster_invalid");
    }
    const approvalReference = normalizeText(
      command.approvalReference,
      160,
      "approval_reference_invalid",
    );
    return Object.freeze({
      kind: "provision",
      issuer,
      subjectDigest,
      displayName,
      role: command.role,
      canManagePilotRoster: command.canManagePilotRoster,
      approvalReference,
    });
  }

  const bindingId = normalizeUuid(command.bindingId, "binding_id_invalid");
  if (
    !Number.isSafeInteger(command.expectedAuditVersion)
    || command.expectedAuditVersion < 1
    || command.expectedAuditVersion > 2_147_483_647
  ) {
    throw new BootstrapCommandInputError("expected_audit_version_invalid");
  }
  const approvalReference = normalizeText(
    command.approvalReference,
    160,
    "approval_reference_invalid",
  );
  return Object.freeze({
    kind: "revoke",
    bindingId,
    expectedAuditVersion: command.expectedAuditVersion,
    approvalReference,
  });
}

export function normalizeHex64(value: string, code: string): string {
  if (typeof value !== "string" || !hex64Pattern.test(value)) {
    throw new BootstrapCommandInputError(code);
  }
  return value.toLowerCase();
}

export function normalizeUuid(value: string, code: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new BootstrapCommandInputError(code);
  }
  return value.toLowerCase();
}

function parseOptions(tokens: readonly string[], allowedNames: readonly string[]): ReadonlyMap<string, string> {
  if (tokens.length % 2 !== 0) {
    throw new BootstrapCommandInputError("option_value_required");
  }

  const allowed = new Set(allowedNames);
  const options = new Map<string, string>();
  for (let index = 0; index < tokens.length; index += 2) {
    const token = tokens[index];
    const value = tokens[index + 1];
    if (!token.startsWith("--")) {
      throw new BootstrapCommandInputError("option_name_invalid");
    }
    const name = token.slice(2);
    if (!allowed.has(name)) {
      throw new BootstrapCommandInputError("option_not_allowed");
    }
    if (options.has(name)) {
      throw new BootstrapCommandInputError("option_repeated");
    }
    if (!value || value.startsWith("--")) {
      throw new BootstrapCommandInputError("option_value_required");
    }
    options.set(name, value);
  }
  return options;
}

function requiredOption(options: ReadonlyMap<string, string>, name: string): string {
  const value = options.get(name);
  if (!value) {
    throw new BootstrapCommandInputError(`option_required_${name.replaceAll("-", "_")}`);
  }
  return value;
}

function parseBoolean(value: string): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new BootstrapCommandInputError("can_manage_pilot_roster_invalid");
}

function parsePositiveInteger(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new BootstrapCommandInputError("expected_audit_version_invalid");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new BootstrapCommandInputError("expected_audit_version_invalid");
  }
  return parsed;
}

function normalizeHttpsIssuer(value: string): string {
  if (typeof value !== "string" || controlCharacterPattern.test(value)) {
    throw new BootstrapCommandInputError("issuer_invalid");
  }
  try {
    const issuer = new URL(value);
    if (
      issuer.protocol !== "https:"
      || issuer.username
      || issuer.password
      || issuer.hash
    ) {
      throw new BootstrapCommandInputError("issuer_invalid");
    }
    return issuer.toString();
  } catch (error) {
    if (error instanceof BootstrapCommandInputError) {
      throw error;
    }
    throw new BootstrapCommandInputError("issuer_invalid");
  }
}

function normalizeText(value: string, maximumLength: number, code: string): string {
  if (typeof value !== "string") {
    throw new BootstrapCommandInputError(code);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength || controlCharacterPattern.test(normalized)) {
    throw new BootstrapCommandInputError(code);
  }
  return normalized;
}
