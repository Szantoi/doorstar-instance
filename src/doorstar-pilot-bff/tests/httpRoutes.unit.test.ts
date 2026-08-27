import { describe, expect, it } from "vitest";
import { pilotBrowserCookieName, pilotSessionCookieName } from "../src/index.js";
import { createTestHarness, testConfig } from "./testDoubles.js";

describe("pilot BFF HTTP auth surface", () => {
  it("uses host-only, secure, opaque cookies across login and callback", async () => {
    const harness = await createTestHarness();
    const login = await harness.app.handle({ method: "GET", url: "/auth/login", headers: {} });
    const browserSetCookie = String(login.headers["Set-Cookie"]);
    const state = new URL(String(login.headers.Location)).searchParams.get("state");

    expect(login.statusCode).toBe(302);
    expect(browserSetCookie).toContain(`${pilotBrowserCookieName}=`);
    expect(browserSetCookie).toContain("Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax");
    expect(browserSetCookie).not.toContain("Domain=");

    const callback = await harness.app.handle({
      method: "GET",
      url: `/auth/callback?code=authorization-code&state=${encodeURIComponent(String(state))}`,
      headers: { cookie: cookiePair(browserSetCookie) },
    });
    const sessionSetCookie = String(callback.headers["Set-Cookie"]);

    expect(callback.statusCode).toBe(303);
    expect(callback.headers.Location).toBe("/");
    expect(sessionSetCookie).toContain(`${pilotSessionCookieName}=`);
    expect(sessionSetCookie).toContain("Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict");
    expect(sessionSetCookie).toContain(`${pilotBrowserCookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    expect(sessionSetCookie).not.toContain("Domain=");
  });

  it("rejects browser-supplied bearer, role, scope and actor authority", async () => {
    const harness = await createTestHarness();
    for (const headers of [
      { authorization: "Bearer forged" },
      { "x-role": "ADMINISTRATOR" },
      { "x-scope": "another-pilot" },
      { "x-actor": "forged-actor" },
    ]) {
      const response = await harness.app.handle({ method: "GET", url: "/auth/login", headers });
      expect(response.statusCode).toBe(400);
      expect(response.body).toBe(JSON.stringify({ error: "invalid_request" }));
    }
  });

  it("rejects duplicate cookie/header ambiguity as a client error instead of choosing an authority value", async () => {
    const harness = await createTestHarness();
    const duplicatedCookie = await harness.app.handle({
      method: "GET",
      url: "/auth/login",
      headers: {
        cookie: `${pilotBrowserCookieName}=one; ${pilotBrowserCookieName}=two`,
      },
    });
    const duplicatedHeader = await harness.app.handle({
      method: "GET",
      url: "/auth/login",
      headers: {
        cookie: ["one=1", "two=2"],
      },
    });

    expect(duplicatedCookie.statusCode).toBe(400);
    expect(duplicatedHeader.statusCode).toBe(400);
    expect(duplicatedCookie.body).toBe(JSON.stringify({ error: "invalid_request" }));
  });

  it("returns only the server-resolved session principal and clears an invalid cookie", async () => {
    const harness = await createTestHarness();
    const login = await harness.app.handle({ method: "GET", url: "/auth/login", headers: {} });
    const callback = await harness.app.handle({
      method: "GET",
      url: `/auth/callback?code=authorization-code&state=${encodeURIComponent(String(new URL(String(login.headers.Location)).searchParams.get("state")))}`,
      headers: { cookie: cookiePair(String(login.headers["Set-Cookie"])) },
    });
    const session = await harness.app.handle({
      method: "GET",
      url: "/auth/session",
      headers: { cookie: cookiePair(String(callback.headers["Set-Cookie"])) },
    });
    const invalid = await harness.app.handle({
      method: "GET",
      url: "/auth/session",
      headers: { cookie: `${pilotSessionCookieName}=forged_session_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` },
    });

    expect(session.statusCode).toBe(200);
    expect(JSON.parse(String(session.body))).toEqual({
      authenticated: true,
      principal: {
        actorKey: "actor-doorstar-001",
        displayName: "Pilot User",
        role: "SALES",
      },
    });
    expect(invalid.statusCode).toBe(401);
    expect(String(invalid.headers["Set-Cookie"])).toContain(`${pilotSessionCookieName}=; Path=/; Max-Age=0`);
  });

  it("requires a same-origin POST to log out and exposes no other auth route", async () => {
    const harness = await createTestHarness();
    const missingOrigin = await harness.app.handle({
      method: "POST",
      url: "/auth/logout",
      headers: {},
    });
    const logout = await harness.app.handle({
      method: "POST",
      url: "/auth/logout",
      headers: {
        origin: testConfig.publicOrigin,
        cookie: `${pilotSessionCookieName}=session_0001_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
      },
    });
    const unknown = await harness.app.handle({ method: "GET", url: "/not-an-auth-route", headers: {} });
    const wrongMethod = await harness.app.handle({ method: "POST", url: "/auth/login", headers: {} });

    expect(missingOrigin.statusCode).toBe(400);
    expect(logout.statusCode).toBe(204);
    expect(harness.sessions.revoked).toHaveLength(1);
    expect(unknown.statusCode).toBe(404);
    expect(wrongMethod.statusCode).toBe(405);
    expect(wrongMethod.headers.Allow).toBe("GET");
  });
});

function cookiePair(setCookie: string): string {
  return setCookie.slice(0, setCookie.indexOf(";"));
}
