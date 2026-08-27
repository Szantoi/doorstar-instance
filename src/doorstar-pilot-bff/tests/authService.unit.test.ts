import { describe, expect, it } from "vitest";
import { createTestHarness } from "./testDoubles.js";

describe("named-user OIDC BFF application", () => {
  it("starts authorization-code PKCE without persisting raw state, nonce or verifier", async () => {
    const harness = await createTestHarness();
    const response = await harness.app.handle({ method: "GET", url: "/auth/login", headers: {} });

    expect(response.statusCode).toBe(302);
    expect(harness.scopes.calls).toBe(1);
    expect(harness.transactions.records).toHaveLength(1);
    expect(harness.oidc.authorizationRequests).toHaveLength(1);
    const stored = harness.transactions.records[0];
    const oidcRequest = harness.oidc.authorizationRequests[0];
    expect(stored.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(oidcRequest.state);
    expect(JSON.stringify(stored)).not.toContain(oidcRequest.nonce);
    expect(JSON.stringify(stored)).not.toContain("pkce_verifier_0004");
    expect(stored).not.toHaveProperty("nonceCiphertext");
    expect(oidcRequest.pkceChallenge).toContain("challenge_");
    expect(stored).not.toHaveProperty("scopeId");
  });

  it("requires a matching browser binding, verifies OIDC and creates an opaque session", async () => {
    const harness = await createTestHarness();
    await harness.app.handle({ method: "GET", url: "/auth/login", headers: {} });
    const oidcRequest = harness.oidc.authorizationRequests[0];
    const browserCookie = "__Host-doorstar-pilot-browser=browser_binding_0001_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    const response = await harness.app.handle({
      method: "GET",
      url: `/auth/callback?code=authorization-code&state=${encodeURIComponent(oidcRequest.state)}`,
      headers: { cookie: browserCookie },
    });

    expect(response.statusCode).toBe(303);
    expect(harness.oidc.codeExchanges[0].expectedNonceHash).toBe(
      harness.transactions.records[0].nonceHash,
    );
    expect(harness.bindings.lookupCalls[0]).toMatchObject({ pilotScopeId: "scope-001" });
    expect(harness.sessions.created).toHaveLength(1);
    expect(harness.sessions.created[0].pilotScopeId).toBe("scope-001");
    expect(JSON.stringify(harness.sessions.created[0])).not.toContain("session_0006");
    expect(String(response.headers["Set-Cookie"])).toContain("__Host-doorstar-pilot-session=");
  });

  it("denies an unknown OIDC identity rather than provisioning a binding", async () => {
    const harness = await createTestHarness();
    harness.bindings.binding = null;
    await harness.app.handle({ method: "GET", url: "/auth/login", headers: {} });
    const request = harness.oidc.authorizationRequests[0];
    const response = await harness.app.handle({
      method: "GET",
      url: `/auth/callback?code=authorization-code&state=${encodeURIComponent(request.state)}`,
      headers: { cookie: "__Host-doorstar-pilot-browser=browser_binding_0001_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    });

    expect(response.statusCode).toBe(403);
    expect(harness.sessions.created).toHaveLength(0);
  });

  it("fails closed when signed-ID-token validation, including nonce validation, rejects the exchange", async () => {
    const harness = await createTestHarness();
    harness.oidc.rejectExchange = true;
    await harness.app.handle({ method: "GET", url: "/auth/login", headers: {} });
    const request = harness.oidc.authorizationRequests[0];

    const response = await harness.app.handle({
      method: "GET",
      url: `/auth/callback?code=authorization-code&state=${encodeURIComponent(request.state)}`,
      headers: { cookie: "__Host-doorstar-pilot-browser=browser_binding_0001_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    });

    expect(response.statusCode).toBe(401);
    expect(harness.sessions.created).toHaveLength(0);
  });

  it("single-consumes state so a replay cannot create another session", async () => {
    const harness = await createTestHarness();
    await harness.app.handle({ method: "GET", url: "/auth/login", headers: {} });
    const request = harness.oidc.authorizationRequests[0];
    const callback = {
      method: "GET",
      url: `/auth/callback?code=authorization-code&state=${encodeURIComponent(request.state)}`,
      headers: { cookie: "__Host-doorstar-pilot-browser=browser_binding_0001_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    } as const;

    expect((await harness.app.handle(callback)).statusCode).toBe(303);
    expect((await harness.app.handle(callback)).statusCode).toBe(400);
    expect(harness.sessions.created).toHaveLength(1);
  });

  it("does not persist a transaction when the OIDC adapter returns an untrusted redirect", async () => {
    const harness = await createTestHarness();
    harness.oidc.authorizationUrlOverride = "https://attacker.example.invalid/authorize";

    const response = await harness.app.handle({ method: "GET", url: "/auth/login", headers: {} });

    expect(response.statusCode).toBe(500);
    expect(harness.transactions.records).toHaveLength(0);
  });
});
