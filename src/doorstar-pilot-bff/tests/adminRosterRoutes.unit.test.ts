import { describe, expect, it } from "vitest";
import { pilotSessionCookieName } from "../src/index.js";
import { createTestHarness, testConfig } from "./testDoubles.js";

describe("pilot administrator roster HTTP surface", () => {
  it("lists only the safe local roster projection for a server-resolved manager session", async () => {
    const harness = await createTestHarness();
    const response = await harness.app.handle({
      method: "GET",
      url: "/admin/users",
      headers: { cookie: await authenticatedSessionCookie(harness) },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(String(response.body))).toEqual({ users: harness.rosterReader.users });
    expect(harness.rosterReader.managerCalls).toHaveLength(1);
    expect(harness.rosterReader.listCalls).toHaveLength(1);
    expect(String(response.body)).not.toContain("oidc-subject");
    expect(String(response.body)).not.toContain("@example");
  });

  it("creates a Keycloak invitation and local binding without accepting browser identity or audit authority", async () => {
    const harness = await createTestHarness();
    const email = "new.person@example.invalid";
    const response = await harness.app.handle({
      method: "POST",
      url: "/admin/users",
      headers: {
        origin: testConfig.publicOrigin,
        "content-type": "application/json; charset=utf-8",
        cookie: await authenticatedSessionCookie(harness),
      },
      body: JSON.stringify({
        displayName: "New Person",
        email,
        role: "SALES",
        canManagePilotRoster: false,
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(harness.directory.createCalls).toEqual([{ email, displayName: "New Person" }]);
    expect(harness.directory.enabledSubjects).toEqual([harness.directory.subject]);
    expect(harness.rosterWriter.provisionCalls).toHaveLength(1);
    const provision = harness.rosterWriter.provisionCalls[0];
    expect(provision).toMatchObject({
      pilotScopeId: "scope-001",
      issuer: testConfig.oidc.issuer,
      displayName: "New Person",
      role: "SALES",
      canManagePilotRoster: false,
      correlationId: "00000000-0000-4000-8000-000000000099",
    });
    expect(provision.actorSessionTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(provision.subjectDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(provision.actorKey).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(provision)).not.toContain(email);
    expect(JSON.stringify(provision)).not.toContain(harness.directory.subject);
    expect(String(response.body)).not.toContain(email);
    expect(String(response.body)).not.toContain(harness.directory.subject);
  });

  it("uses PUT for a complete, same-origin existing-binding policy replacement", async () => {
    const harness = await createTestHarness();
    const bindingId = "00000000-0000-4000-8000-000000000010";
    const response = await harness.app.handle({
      method: "PUT",
      url: `/admin/users/${bindingId}`,
      headers: {
        origin: testConfig.publicOrigin,
        "content-type": "application/json",
        cookie: await authenticatedSessionCookie(harness),
      },
      body: JSON.stringify({
        expectedAuditVersion: 1,
        role: "READER",
        active: false,
        canManagePilotRoster: false,
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(harness.rosterWriter.updateCalls).toEqual([expect.objectContaining({
      targetBindingId: bindingId,
      expectedAuditVersion: 1,
      role: "READER",
      active: false,
      canManagePilotRoster: false,
      reason: "admin-roster-policy-update",
    })]);
    expect(JSON.parse(String(response.body))).toEqual({ user: harness.rosterWriter.updatedUser });
  });

  it("denies a valid non-manager session before directory work", async () => {
    const harness = await createTestHarness();
    harness.rosterReader.manager = null;
    const response = await harness.app.handle({
      method: "POST",
      url: "/admin/users",
      headers: {
        origin: testConfig.publicOrigin,
        "content-type": "application/json",
        cookie: await authenticatedSessionCookie(harness),
      },
      body: JSON.stringify({
        displayName: "Denied Person",
        email: "denied@example.invalid",
        role: "SALES",
        canManagePilotRoster: false,
      }),
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toBe(JSON.stringify({ error: "access_denied" }));
    expect(harness.directory.createCalls).toHaveLength(0);
    expect(harness.rosterWriter.provisionCalls).toHaveLength(0);
  });

  it("rejects cross-origin, malformed and browser-authority payloads without directory work", async () => {
    const harness = await createTestHarness();
    const sessionCookie = await authenticatedSessionCookie(harness);
    const rejected = await Promise.all([
      harness.app.handle({
        method: "POST",
        url: "/admin/users",
        headers: {
          origin: "https://attacker.example.invalid",
          "content-type": "application/json",
          cookie: sessionCookie,
        },
        body: JSON.stringify({
          displayName: "No Origin",
          email: "origin@example.invalid",
          role: "SALES",
          canManagePilotRoster: false,
        }),
      }),
      harness.app.handle({
        method: "POST",
        url: "/admin/users",
        headers: {
          origin: testConfig.publicOrigin,
          "content-type": "application/json",
          "x-can-manage-pilot-roster": "true",
          cookie: sessionCookie,
        },
        body: JSON.stringify({
          displayName: "Forged Capability",
          email: "forged-capability@example.invalid",
          role: "SALES",
          canManagePilotRoster: false,
        }),
      }),
      harness.app.handle({
        method: "POST",
        url: "/admin/users",
        headers: {
          origin: testConfig.publicOrigin,
          "content-type": "text/plain",
          cookie: sessionCookie,
        },
        body: "not-json",
      }),
      harness.app.handle({
        method: "POST",
        url: "/admin/users",
        headers: {
          origin: testConfig.publicOrigin,
          "content-type": "application/json",
          "x-role": "ADMINISTRATOR",
          cookie: sessionCookie,
        },
        body: JSON.stringify({
          displayName: "Forged Role",
          email: "forged@example.invalid",
          role: "SALES",
          canManagePilotRoster: false,
        }),
      }),
    ]);

    for (const response of rejected) {
      expect(response.statusCode).toBe(400);
      expect(response.body).toBe(JSON.stringify({ error: "invalid_request" }));
    }
    expect(harness.directory.createCalls).toHaveLength(0);
  });

  it("compensates a created directory account and returns no personal data when local provision fails", async () => {
    const harness = await createTestHarness();
    harness.rosterWriter.failProvision = true;
    const email = "compensated@example.invalid";
    const response = await harness.app.handle({
      method: "POST",
      url: "/admin/users",
      headers: {
        origin: testConfig.publicOrigin,
        "content-type": "application/json",
        cookie: await authenticatedSessionCookie(harness),
      },
      body: JSON.stringify({
        displayName: "Compensated Person",
        email,
        role: "SALES",
        canManagePilotRoster: false,
      }),
    });

    expect(response.statusCode).toBe(503);
    expect(response.body).toBe(JSON.stringify({ error: "administration_unavailable" }));
    expect(harness.directory.enabledSubjects).toEqual([]);
    expect(harness.directory.disabledSubjects).toEqual([harness.directory.subject]);
    expect(String(response.body)).not.toContain(email);
    expect(String(response.body)).not.toContain(harness.directory.subject);
  });

  it("also compensates an unusable directory subject before a local binding is attempted", async () => {
    const harness = await createTestHarness();
    harness.directory.subject = "invalid subject";
    const response = await harness.app.handle({
      method: "POST",
      url: "/admin/users",
      headers: {
        origin: testConfig.publicOrigin,
        "content-type": "application/json",
        cookie: await authenticatedSessionCookie(harness),
      },
      body: JSON.stringify({
        displayName: "Invalid Subject",
        email: "invalid-subject@example.invalid",
        role: "SALES",
        canManagePilotRoster: false,
      }),
    });

    expect(response.statusCode).toBe(503);
    expect(harness.directory.enabledSubjects).toEqual([]);
    expect(harness.directory.disabledSubjects).toEqual(["invalid subject"]);
    expect(harness.rosterWriter.provisionCalls).toHaveLength(0);
  });

  it("fails closed and deactivates the new local binding when directory activation fails", async () => {
    const harness = await createTestHarness();
    harness.directory.failEnable = true;
    const response = await harness.app.handle({
      method: "POST",
      url: "/admin/users",
      headers: {
        origin: testConfig.publicOrigin,
        "content-type": "application/json",
        cookie: await authenticatedSessionCookie(harness),
      },
      body: JSON.stringify({
        displayName: "Activation Failure",
        email: "activation-failure@example.invalid",
        role: "SALES",
        canManagePilotRoster: false,
      }),
    });

    expect(response.statusCode).toBe(503);
    expect(response.body).toBe(JSON.stringify({ error: "administration_unavailable" }));
    expect(harness.directory.enabledSubjects).toEqual([harness.directory.subject]);
    expect(harness.directory.disabledSubjects).toEqual([harness.directory.subject]);
    expect(harness.rosterWriter.updateCalls).toEqual([expect.objectContaining({
      targetBindingId: harness.rosterWriter.provisionedUser.bindingId,
      expectedAuditVersion: harness.rosterWriter.provisionedUser.auditVersion,
      role: harness.rosterWriter.provisionedUser.role,
      active: false,
      canManagePilotRoster: harness.rosterWriter.provisionedUser.canManagePilotRoster,
      reason: "admin-roster-directory-enable-failed",
    })]);
    expect(String(response.body)).not.toContain("activation-failure@example.invalid");
    expect(String(response.body)).not.toContain(harness.directory.subject);
  });

  it("clears a missing or invalid opaque session without attempting roster work", async () => {
    const harness = await createTestHarness();
    const response = await harness.app.handle({
      method: "GET",
      url: "/admin/users",
      headers: {
        cookie: `${pilotSessionCookieName}=forged_session_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(String(response.headers["Set-Cookie"])).toContain(`${pilotSessionCookieName}=; Path=/; Max-Age=0`);
    expect(harness.rosterReader.managerCalls).toHaveLength(0);
  });
});

async function authenticatedSessionCookie(
  harness: Awaited<ReturnType<typeof createTestHarness>>,
): Promise<string> {
  const login = await harness.app.handle({ method: "GET", url: "/auth/login", headers: {} });
  const state = new URL(String(login.headers.Location)).searchParams.get("state");
  const callback = await harness.app.handle({
    method: "GET",
    url: `/auth/callback?code=authorization-code&state=${encodeURIComponent(String(state))}`,
    headers: { cookie: cookiePair(String(login.headers["Set-Cookie"])) },
  });
  return cookiePair(String(callback.headers["Set-Cookie"]));
}

function cookiePair(setCookie: string): string {
  return setCookie.slice(0, setCookie.indexOf(";"));
}
