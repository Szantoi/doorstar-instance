import { describe, expect, it } from "vitest";
import {
  NodeKeycloakDirectoryAdmin,
  type KeycloakAdminApiFetch,
  type KeycloakAdminApiResponse,
} from "../src/index.js";
import { testConfig } from "./testDoubles.js";

describe("NodeKeycloakDirectoryAdmin", () => {
  it("restores a disabled Keycloak user after required temporary invitation enablement, then explicitly enables it after local provisioning", async () => {
    const requests: Array<Readonly<{ url: string; method: string; body: string; authorization: string }>> = [];
    const responses = [
      response(200, { access_token: "management-token-never-returned" }),
      response(201, undefined, `${testConfig.keycloakAdmin.realmAdminBaseUrl}/users/user-002`),
      response(204),
      response(204),
      response(204),
      response(200, { access_token: "management-token-enable" }),
      response(204),
    ];
    const directory = new NodeKeycloakDirectoryAdmin(testConfig, {
      fetch: scriptedFetch(responses, requests),
    });

    const result = await directory.createAccountAndSendInvitation({
      email: "new.person@example.invalid",
      displayName: "New Person",
    });
    await directory.enableCreatedAccount(result);

    expect(result).toEqual({ subject: "user-002" });
    expect(requests).toHaveLength(7);
    expect(requests[0]).toMatchObject({
      url: testConfig.oidc.tokenEndpoint,
      method: "POST",
      body: "grant_type=client_credentials",
      authorization: expect.stringMatching(/^Basic /),
    });
    expect(JSON.parse(requests[1].body)).toEqual({
      username: "new.person@example.invalid",
      email: "new.person@example.invalid",
      firstName: "New Person",
      enabled: false,
      emailVerified: false,
      requiredActions: ["VERIFY_EMAIL", "UPDATE_PASSWORD"],
    });
    expect(requests[1].authorization).toBe("Bearer management-token-never-returned");
    expect(requests[2]).toMatchObject({
      method: "PUT",
      url: `${testConfig.keycloakAdmin.realmAdminBaseUrl}/users/user-002`,
      body: JSON.stringify({ enabled: true }),
      authorization: "Bearer management-token-never-returned",
    });
    expect(requests[3].url).toContain("/users/user-002/execute-actions-email?lifespan=86400");
    expect(JSON.parse(requests[3].body)).toEqual(["VERIFY_EMAIL", "UPDATE_PASSWORD"]);
    expect(requests[4]).toMatchObject({
      method: "PUT",
      url: `${testConfig.keycloakAdmin.realmAdminBaseUrl}/users/user-002`,
      body: JSON.stringify({ enabled: false }),
      authorization: "Bearer management-token-never-returned",
    });
    expect(requests[6]).toMatchObject({
      method: "PUT",
      url: `${testConfig.keycloakAdmin.realmAdminBaseUrl}/users/user-002`,
      body: JSON.stringify({ enabled: true }),
      authorization: "Bearer management-token-enable",
    });
    expect(JSON.stringify(result)).not.toContain("management-token-never-returned");
  });

  it("makes a just-created account unavailable when Keycloak invitation delivery fails", async () => {
    const requests: Array<Readonly<{ url: string; method: string; body: string; authorization: string }>> = [];
    const responses = [
      response(200, { access_token: "management-token-one" }),
      response(201, undefined, `${testConfig.keycloakAdmin.realmAdminBaseUrl}/users/user-003`),
      response(204),
      response(500),
      response(200, { access_token: "management-token-two" }),
      response(204),
    ];
    const directory = new NodeKeycloakDirectoryAdmin(testConfig, {
      fetch: scriptedFetch(responses, requests),
    });

    await expect(directory.createAccountAndSendInvitation({
      email: "unavailable@example.invalid",
      displayName: "Unavailable Person",
    })).rejects.toThrow("pilot_keycloak_directory_unavailable");

    expect(requests).toHaveLength(6);
    expect(requests[2]).toMatchObject({
      method: "PUT",
      url: `${testConfig.keycloakAdmin.realmAdminBaseUrl}/users/user-003`,
      body: JSON.stringify({ enabled: true }),
      authorization: "Bearer management-token-one",
    });
    expect(requests[5]).toMatchObject({
      method: "PUT",
      url: `${testConfig.keycloakAdmin.realmAdminBaseUrl}/users/user-003`,
      body: JSON.stringify({ enabled: false }),
      authorization: "Bearer management-token-two",
    });
    expect(JSON.parse(requests[1].body)).toMatchObject({ enabled: false });
  });

  it.each([
    ["missing", null],
    ["malicious", "https://attacker.example.invalid/users/user-004"],
    ["malformed", `${testConfig.keycloakAdmin.realmAdminBaseUrl}/users/user-004/extra`],
  ])("keeps the account fail-closed when a %s create Location cannot be used", async (_kind, location) => {
    const requests: Array<Readonly<{ url: string; method: string; body: string; authorization: string }>> = [];
    const directory = new NodeKeycloakDirectoryAdmin(testConfig, {
      fetch: scriptedFetch([
        response(200, { access_token: "management-token-location" }),
        response(201, undefined, location),
      ], requests),
    });

    await expect(directory.createAccountAndSendInvitation({
      email: "location@example.invalid",
      displayName: "Location Person",
    })).rejects.toThrow("pilot_keycloak_directory_unavailable");

    // A user may exist in Keycloak, but it was born disabled and no usable
    // subject was accepted for invitation or later activation.
    expect(requests).toHaveLength(2);
    expect(JSON.parse(requests[1].body)).toMatchObject({ enabled: false });
  });

  it("uses only a generic failure when a Keycloak response is malformed", async () => {
    const directory = new NodeKeycloakDirectoryAdmin(testConfig, {
      fetch: async () => response(200, { access_token: "too-short" }),
    });

    await expect(directory.createAccountAndSendInvitation({
      email: "private.person@example.invalid",
      displayName: "Private Person",
    })).rejects.toThrow("pilot_keycloak_directory_unavailable");
  });
});

function scriptedFetch(
  responses: readonly KeycloakAdminApiResponse[],
  requests: Array<Readonly<{ url: string; method: string; body: string; authorization: string }>>,
): KeycloakAdminApiFetch {
  let index = 0;
  return async (url, init) => {
    requests.push({
      url,
      method: init.method,
      body: init.body,
      authorization: init.headers.Authorization,
    });
    const responseValue = responses[index];
    index += 1;
    if (!responseValue) {
      throw new Error("unexpected_request");
    }
    return responseValue;
  };
}

function response(
  status: number,
  jsonValue: unknown = {},
  location: string | null = null,
): KeycloakAdminApiResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "location" ? location : null },
    json: async () => jsonValue,
  };
}
