import { Buffer } from "node:buffer";
import type { PilotBffConfig } from "../../config/pilotBffConfig.js";
import type {
  CreatedPilotDirectoryAccount,
  PilotDirectoryAdmin,
} from "../../ports/directory.js";

export type KeycloakAdminApiResponse = Readonly<{
  ok: boolean;
  status: number;
  headers: Readonly<{
    get(name: string): string | null;
  }>;
  json(): Promise<unknown>;
}>;

export type KeycloakAdminApiFetch = (
  url: string,
  init: Readonly<{
    method: "POST" | "PUT";
    headers: Readonly<Record<string, string>>;
    body: string;
    redirect: "error";
  }>,
) => Promise<KeycloakAdminApiResponse>;

export type NodeKeycloakDirectoryAdminOptions = Readonly<{
  /** Test seam. Production uses the platform fetch implementation. */
  fetch?: KeycloakAdminApiFetch;
}>;

/**
 * Server-only Keycloak directory adapter. It obtains a management token only
 * in local variables, creates an initially disabled account, and asks
 * Keycloak to deliver its own verification/password-setup message. The BFF
 * enables the account only after a database-owned local binding succeeds.
 * The browser never sees a password, token, raw subject, or management
 * response.
 */
export class NodeKeycloakDirectoryAdmin implements PilotDirectoryAdmin {
  private readonly request: KeycloakAdminApiFetch;

  public constructor(
    private readonly config: PilotBffConfig,
    options: NodeKeycloakDirectoryAdminOptions = {},
  ) {
    this.request = options.fetch ?? defaultKeycloakAdminFetch;
  }

  public async createAccountAndSendInvitation(input: Readonly<{
    email: string;
    displayName: string;
  }>): Promise<CreatedPilotDirectoryAccount> {
    assertDirectoryCreateInput(input);
    let created: CreatedPilotDirectoryAccount | undefined;
    try {
      const accessToken = await this.getManagementAccessToken();
      const createdResponse = await this.request(this.usersUrl(), {
        method: "POST",
        headers: this.jsonHeaders(accessToken),
        body: JSON.stringify({
          username: input.email,
          email: input.email,
          firstName: input.displayName,
          // Location is needed to address a Keycloak user. Keep the account
          // fail-closed until both Location validation and local provisioning
          // have completed.
          enabled: false,
          emailVerified: false,
          requiredActions: ["VERIFY_EMAIL", "UPDATE_PASSWORD"],
        }),
        redirect: "error",
      });
      if (!createdResponse.ok || createdResponse.status !== 201) {
        throw new Error("keycloak_create_rejected");
      }
      created = { subject: readCreatedSubject(createdResponse.headers.get("location"), this.usersUrl()) };

      const invitationResponse = await this.request(this.invitationUrl(created.subject), {
        method: "PUT",
        headers: this.jsonHeaders(accessToken),
        body: JSON.stringify(["VERIFY_EMAIL", "UPDATE_PASSWORD"]),
        redirect: "error",
      });
      if (!invitationResponse.ok || invitationResponse.status !== 204) {
        throw new Error("keycloak_invitation_rejected");
      }
      return created;
    } catch {
      if (created) {
        try {
          await this.disableCreatedAccount(created);
        } catch {
          // The caller receives the same generic availability failure.
        }
      }
      throw new Error("pilot_keycloak_directory_unavailable");
    }
  }

  public async disableCreatedAccount(input: CreatedPilotDirectoryAccount): Promise<void> {
    await this.setCreatedAccountEnabled(input, false);
  }

  public async enableCreatedAccount(input: CreatedPilotDirectoryAccount): Promise<void> {
    await this.setCreatedAccountEnabled(input, true);
  }

  private async setCreatedAccountEnabled(
    input: CreatedPilotDirectoryAccount,
    enabled: boolean,
  ): Promise<void> {
    const subject = requireOpaqueDirectorySubject(input?.subject);
    try {
      const accessToken = await this.getManagementAccessToken();
      const response = await this.request(this.userUrl(subject), {
        method: "PUT",
        headers: this.jsonHeaders(accessToken),
        body: JSON.stringify({ enabled }),
        redirect: "error",
      });
      if (!response.ok || response.status !== 204) {
        throw new Error("keycloak_account_update_rejected");
      }
    } catch {
      throw new Error("pilot_keycloak_directory_unavailable");
    }
  }

  private async getManagementAccessToken(): Promise<string> {
    try {
      const response = await this.request(this.config.oidc.tokenEndpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: basicAuthorization(
            this.config.keycloakAdmin.clientId,
            this.config.keycloakAdmin.clientSecret,
          ),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
        redirect: "error",
      });
      if (!response.ok || response.status !== 200) {
        throw new Error("keycloak_management_token_rejected");
      }
      return readManagementAccessToken(await response.json());
    } catch {
      throw new Error("pilot_keycloak_directory_unavailable");
    }
  }

  private jsonHeaders(accessToken: string): Readonly<Record<string, string>> {
    return {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
  }

  private usersUrl(): string {
    return `${this.config.keycloakAdmin.realmAdminBaseUrl}/users`;
  }

  private userUrl(subject: string): string {
    return `${this.usersUrl()}/${encodeURIComponent(subject)}`;
  }

  private invitationUrl(subject: string): string {
    const url = new URL(`${this.userUrl(subject)}/execute-actions-email`);
    url.searchParams.set("lifespan", "86400");
    return url.toString();
  }
}

function defaultKeycloakAdminFetch(
  url: string,
  init: Readonly<{
    method: "POST" | "PUT";
    headers: Readonly<Record<string, string>>;
    body: string;
    redirect: "error";
  }>,
): Promise<KeycloakAdminApiResponse> {
  return globalThis.fetch(url, init);
}

function assertDirectoryCreateInput(input: Readonly<{ email: string; displayName: string }>): void {
  if (
    !isSafeEmail(input?.email)
    || !isSafeText(input?.displayName, 160)
  ) {
    throw new Error("pilot_keycloak_directory_input_invalid");
  }
}

function readManagementAccessToken(value: unknown): string {
  if (
    !isRecord(value)
    || typeof value.access_token !== "string"
    || value.access_token.length < 16
    || value.access_token.length > 16_384
    || /[\r\n\u0000]/.test(value.access_token)
  ) {
    throw new Error("keycloak_management_token_invalid");
  }
  return value.access_token;
}

function readCreatedSubject(location: string | null, usersUrl: string): string {
  if (!location) {
    throw new Error("keycloak_create_location_missing");
  }
  let resolved: URL;
  try {
    resolved = new URL(location, `${usersUrl}/`);
  } catch {
    throw new Error("keycloak_create_location_invalid");
  }
  const expectedPrefix = `${new URL(usersUrl).pathname}/`;
  if (
    resolved.origin !== new URL(usersUrl).origin
    || !resolved.pathname.startsWith(expectedPrefix)
    || resolved.search
    || resolved.hash
  ) {
    throw new Error("keycloak_create_location_invalid");
  }
  const encodedSubject = resolved.pathname.slice(expectedPrefix.length);
  if (!encodedSubject || encodedSubject.includes("/")) {
    throw new Error("keycloak_create_location_invalid");
  }
  try {
    return requireOpaqueDirectorySubject(decodeURIComponent(encodedSubject));
  } catch {
    throw new Error("keycloak_create_location_invalid");
  }
}

function requireOpaqueDirectorySubject(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
    throw new Error("keycloak_subject_invalid");
  }
  return value;
}

function basicAuthorization(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

function isSafeEmail(value: unknown): value is string {
  return (
    typeof value === "string"
    && value.length <= 254
    && value === value.trim()
    && !/[\r\n\u0000]/.test(value)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function isSafeText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string"
    && value.length > 0
    && value.length <= maximumLength
    && value === value.trim()
    && !/[\r\n\u0000]/.test(value)
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
