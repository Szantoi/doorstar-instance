/**
 * Deliberately small configuration boundary for the future Microsoft Graph
 * connector. Credentials are acquired by the deployment/runtime identity and
 * are never read from a workbook, request or document record.
 */
export interface SharePointReadConfig {
  mode: "read_only";
  tenantId: string;
  clientId: string;
  siteId: string;
  driveId: string;
}

export type SharePointConfig = SharePointReadConfig | { mode: "disabled" };

const REQUIRED_KEYS = ["SHAREPOINT_TENANT_ID", "SHAREPOINT_CLIENT_ID", "SHAREPOINT_SITE_ID", "SHAREPOINT_DRIVE_ID"] as const;

/** Fail closed: a partial configuration never creates a partially privileged connector. */
export function loadSharePointConfig(env: NodeJS.ProcessEnv = process.env): SharePointConfig {
  const values = REQUIRED_KEYS.map((key) => env[key]?.trim() ?? "");
  if (values.every((value) => value === "")) return { mode: "disabled" };
  if (values.some((value) => value === "")) {
    throw new Error(`incomplete_sharepoint_configuration:${REQUIRED_KEYS.filter((_, index) => values[index] === "").join(",")}`);
  }

  return {
    mode: "read_only",
    tenantId: values[0],
    clientId: values[1],
    siteId: values[2],
    driveId: values[3],
  };
}
