import { readFile } from "node:fs/promises";
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";

const maximumStaticAssetBytes = 512 * 1_024;

const htmlContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "connect-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
].join("; ");

const staticContentSecurityPolicy = [
  "default-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

const staticResponseHeaders = Object.freeze({
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
});

type OfficeStaticAsset = Readonly<{
  contentType: string;
  contentSecurityPolicy: string;
  body: Buffer;
}>;

export type PilotOfficeStaticAssets = Readonly<{
  get(requestPath: string): OfficeStaticAsset | undefined;
}>;

const assetDefinitions = [
  {
    requestPaths: ["/", "/index.html", "/login"],
    fileName: "index.html",
    contentType: "text/html; charset=utf-8",
    contentSecurityPolicy: htmlContentSecurityPolicy,
  },
  {
    requestPaths: ["/assets/office.css"],
    fileName: "office.css",
    contentType: "text/css; charset=utf-8",
    contentSecurityPolicy: staticContentSecurityPolicy,
  },
  {
    requestPaths: ["/assets/office.js"],
    fileName: "office.js",
    contentType: "text/javascript; charset=utf-8",
    contentSecurityPolicy: staticContentSecurityPolicy,
  },
] as const;

/** Static assets are loaded and bounded before the listener is opened. */
export async function loadPilotOfficeStaticAssets(
  staticDirectory: URL = new URL("./static/", import.meta.url),
): Promise<PilotOfficeStaticAssets> {
  const assets = new Map<string, OfficeStaticAsset>();

  await Promise.all(assetDefinitions.map(async (definition) => {
    const body = await readFile(new URL(definition.fileName, staticDirectory));
    if (body.byteLength === 0 || body.byteLength > maximumStaticAssetBytes) {
      throw new Error("pilot_office_static_asset_invalid");
    }
    const asset = Object.freeze({
      contentType: definition.contentType,
      contentSecurityPolicy: definition.contentSecurityPolicy,
      body,
    });
    for (const requestPath of definition.requestPaths) {
      assets.set(requestPath, asset);
    }
  }));

  return Object.freeze({
    get: (requestPath) => assets.get(requestPath),
  });
}

/**
 * A fixed allowlist deliberately replaces generic filesystem serving. It
 * prevents traversal, directory discovery and accidental exposure of source
 * or deployment files through the loopback listener.
 */
export function servePilotOfficeStaticRequest(
  request: IncomingMessage,
  response: ServerResponse,
  assets: PilotOfficeStaticAssets,
): void {
  if (hasRejectedStaticRequestBody(request)) {
    // Do not call resume() here: an attacker-controlled static request body
    // has no useful consumer. Closing the connection after the bounded error
    // prevents an unbounded drain while leaving valid GET/HEAD assets intact.
    writeStaticError(response, 400, "invalid_request", undefined, true);
    return;
  }

  // Valid static requests are bodyless or explicitly zero-length. Draining
  // that finished stream is safe and allows normal HTTP keep-alive reuse.
  request.resume();
  const requestPath = exactStaticRequestPath(request.url);
  const asset = requestPath ? assets.get(requestPath) : undefined;
  if (!asset) {
    writeStaticError(response, 404, "not_found");
    return;
  }

  const method = request.method?.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    writeStaticError(response, 405, "method_not_allowed", "GET, HEAD");
    return;
  }

  const headers: OutgoingHttpHeaders = {
    ...staticResponseHeaders,
    "Content-Type": asset.contentType,
    "Content-Length": String(asset.body.byteLength),
    "Content-Security-Policy": asset.contentSecurityPolicy,
  };
  response.writeHead(200, headers);
  response.end(method === "HEAD" ? undefined : asset.body);
}

function exactStaticRequestPath(target: string | undefined): string | undefined {
  if (
    !target
    || !target.startsWith("/")
    || target.startsWith("//")
    || target.includes("?")
    || target.includes("#")
  ) {
    return undefined;
  }
  return target;
}

function hasRejectedStaticRequestBody(request: IncomingMessage): boolean {
  const transferEncoding = request.headers["transfer-encoding"];
  if (transferEncoding !== undefined) {
    return true;
  }

  const contentLength = request.headers["content-length"];
  return contentLength !== undefined && contentLength !== "0";
}

function writeStaticError(
  response: ServerResponse,
  statusCode: 400 | 404 | 405,
  error: "invalid_request" | "not_found" | "method_not_allowed",
  allow?: string,
  closeConnection = false,
): void {
  const headers: OutgoingHttpHeaders = {
    ...staticResponseHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Security-Policy": staticContentSecurityPolicy,
  };
  if (allow) {
    headers.Allow = allow;
  }
  if (closeConnection) {
    response.shouldKeepAlive = false;
    headers.Connection = "close";
  }
  response.writeHead(statusCode, headers);
  response.end(JSON.stringify({ error }));
}
