/**
 * Configuration boundary for the server-held Doorstar identity-authority client.
 * All configuration must be absent to disable the client; partial configuration is
 * an operational error instead of a partially privileged fallback.
 */
export const IDENTITY_AUTHORITY_CLIENT_ID = "doorstar-identity-authority";
export const IDENTITY_AUTHORITY_SCOPE = "identity-authority.resolve";
export const IDENTITY_AUTHORITY_RESOLVER_PATH = "/api/internal/identity-authority/resolve";

const REQUIRED_CONFIG_KEYS = [
  "SPACEOS_IDENTITY_AUTHORITY_ISSUER",
  "SPACEOS_IDENTITY_AUTHORITY_KERNEL_ORIGIN",
  "SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_PATH",
  "SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_KID",
] as const;

export interface IdentityAuthorityEnabledConfig {
  readonly mode: "enabled";
  readonly issuer: string;
  readonly tokenEndpoint: string;
  readonly kernelOrigin: string;
  readonly resolverUrl: string;
  readonly privateKeyPath: string;
  readonly privateKeyKid: string;
  readonly clientId: typeof IDENTITY_AUTHORITY_CLIENT_ID;
  readonly scope: typeof IDENTITY_AUTHORITY_SCOPE;
}

export type IdentityAuthorityConfig = IdentityAuthorityEnabledConfig | { readonly mode: "disabled" };

/** Loads an all-or-nothing, canonical HTTPS configuration from the process environment. */
export function loadIdentityAuthorityConfig(env: NodeJS.ProcessEnv = process.env): IdentityAuthorityConfig {
  const rawValues = REQUIRED_CONFIG_KEYS.map((key) => env[key] ?? "");
  const values = rawValues.map((value) => value.trim());
  if (values.every((value) => value === "")) return { mode: "disabled" };

  const missingKeys = REQUIRED_CONFIG_KEYS.filter((_, index) => values[index] === "");
  if (missingKeys.length > 0) {
    throw new Error(`incomplete_identity_authority_configuration:${missingKeys.join(",")}`);
  }

  const issuer = requireCanonicalHttpsBaseUrl(rawValues[0]!, "issuer");
  const kernelOrigin = requireCanonicalHttpsOrigin(rawValues[1]!);
  const privateKeyPath = requirePrivateKeyPath(rawValues[2]!);
  const privateKeyKid = requirePrivateKeyKid(rawValues[3]!);

  return {
    mode: "enabled",
    issuer,
    tokenEndpoint: `${issuer}/protocol/openid-connect/token`,
    kernelOrigin,
    resolverUrl: `${kernelOrigin}${IDENTITY_AUTHORITY_RESOLVER_PATH}`,
    privateKeyPath,
    privateKeyKid,
    clientId: IDENTITY_AUTHORITY_CLIENT_ID,
    scope: IDENTITY_AUTHORITY_SCOPE,
  };
}

/**
 * Revalidates and freezes a composition-supplied config before a private key is
 * read. TypeScript readonly fields are not a runtime capability boundary.
 */
export function snapshotIdentityAuthorityConfig(config: IdentityAuthorityConfig): IdentityAuthorityConfig {
  if (config === null || typeof config !== "object" || !("mode" in config)) {
    throw new Error("identity_authority_config_invalid");
  }
  if (config.mode === "disabled") return Object.freeze({ mode: "disabled" as const });
  if (config.mode !== "enabled") throw new Error("identity_authority_config_invalid");

  const candidate = config as unknown as Record<string, unknown>;
  const issuer = requireString(candidate.issuer);
  const kernelOrigin = requireString(candidate.kernelOrigin);
  const privateKeyPath = requireString(candidate.privateKeyPath);
  const privateKeyKid = requireString(candidate.privateKeyKid);
  const normalized = loadIdentityAuthorityConfig({
    SPACEOS_IDENTITY_AUTHORITY_ISSUER: issuer,
    SPACEOS_IDENTITY_AUTHORITY_KERNEL_ORIGIN: kernelOrigin,
    SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_PATH: privateKeyPath,
    SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_KID: privateKeyKid,
  });
  if (normalized.mode !== "enabled"
    || candidate.tokenEndpoint !== normalized.tokenEndpoint
    || candidate.resolverUrl !== normalized.resolverUrl
    || candidate.clientId !== IDENTITY_AUTHORITY_CLIENT_ID
    || candidate.scope !== IDENTITY_AUTHORITY_SCOPE) {
    throw new Error("identity_authority_config_invalid");
  }
  return Object.freeze({ ...normalized });
}

function requireCanonicalHttpsBaseUrl(value: string, name: string): string {
  if (value !== value.trim() || value.length === 0 || value.endsWith("/")) {
    throw new Error(`invalid_identity_authority_${name}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`invalid_identity_authority_${name}`);
  }

  if (parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== ""
    || parsed.pathname.includes("//")) {
    throw new Error(`invalid_identity_authority_${name}`);
  }

  const canonical = `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  if (value !== canonical) throw new Error(`invalid_identity_authority_${name}`);
  return canonical;
}

/** The resolver has a source-pinned absolute path, so its canonical HTTPS origin cannot carry a path. */
function requireCanonicalHttpsOrigin(value: string): string {
  const canonical = requireCanonicalHttpsBaseUrl(value, "kernel_origin");
  if (new URL(canonical).pathname !== "/") throw new Error("invalid_identity_authority_kernel_origin");
  return canonical;
}

function requirePrivateKeyPath(value: string): string {
  if (value !== value.trim() || value.length === 0 || /[\r\n\0]/u.test(value)) {
    throw new Error("invalid_identity_authority_private_key_path");
  }
  return value;
}

function requirePrivateKeyKid(value: string): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/u.test(value)) {
    throw new Error("invalid_identity_authority_private_key_kid");
  }
  return value;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") throw new Error("identity_authority_config_invalid");
  return value;
}
