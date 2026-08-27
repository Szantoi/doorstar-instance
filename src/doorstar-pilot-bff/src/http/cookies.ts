import type { PilotHttpHeaderValue } from "./contracts.js";

export const pilotBrowserCookieName = "__Host-doorstar-pilot-browser";
export const pilotSessionCookieName = "__Host-doorstar-pilot-session";

export class PilotCookieError extends Error {
  public constructor(code: "duplicate_cookie" | "duplicate_header") {
    super(`pilot_auth_${code}`);
    this.name = "PilotCookieError";
  }
}

export function readRequestCookie(
  headers: Readonly<Record<string, PilotHttpHeaderValue>>,
  expectedName: string,
): string | undefined {
  const cookieHeader = readSingleHeader(headers, "cookie");
  if (!cookieHeader) {
    return undefined;
  }

  let result: string | undefined;
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = pair.slice(0, separator).trim();
    if (name !== expectedName) {
      continue;
    }
    if (result !== undefined) {
      throw new PilotCookieError("duplicate_cookie");
    }
    result = pair.slice(separator + 1).trim();
  }
  return result;
}

export function readSingleHeader(
  headers: Readonly<Record<string, PilotHttpHeaderValue>>,
  expectedName: string,
): string | undefined {
  const matching = Object.entries(headers).filter(
    ([name, value]) => name.toLowerCase() === expectedName && value !== undefined,
  );
  if (matching.length > 1) {
    throw new PilotCookieError("duplicate_header");
  }
  if (matching.length === 0) {
    return undefined;
  }
  const value = matching[0][1];
  if (typeof value === "string") {
    return value;
  }
  if (!value || value.length !== 1) {
    throw new PilotCookieError("duplicate_header");
  }
  return value[0];
}

export function hasHeader(
  headers: Readonly<Record<string, PilotHttpHeaderValue>>,
  expectedName: string,
): boolean {
  return Object.entries(headers).some(
    ([name, value]) => name.toLowerCase() === expectedName && value !== undefined,
  );
}

/** Lax is required only so the top-level OIDC callback can carry this value. */
export function setBrowserBindingCookie(value: string, maxAgeSeconds: number): string {
  return formatHostOnlyCookie(pilotBrowserCookieName, value, maxAgeSeconds, "Lax");
}

export function clearBrowserBindingCookie(): string {
  return formatHostOnlyCookie(pilotBrowserCookieName, "", 0, "Lax");
}

/** The authenticated Office session never needs a cross-site request. */
export function setSessionCookie(value: string, maxAgeSeconds: number): string {
  return formatHostOnlyCookie(pilotSessionCookieName, value, maxAgeSeconds, "Strict");
}

export function clearSessionCookie(): string {
  return formatHostOnlyCookie(pilotSessionCookieName, "", 0, "Strict");
}

function formatHostOnlyCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  sameSite: "Lax" | "Strict",
): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=${sameSite}`;
}
