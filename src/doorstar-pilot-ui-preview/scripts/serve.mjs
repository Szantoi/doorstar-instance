import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

export const LOOPBACK_HOST = "127.0.0.1";
// Kept away from the existing local Vite development ports on this workspace.
export const DEFAULT_PORT = 4317;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(scriptDirectory, "..", "public");
const staticAssets = new Map([
  ["/", { fileName: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/index.html", { fileName: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/styles.css", { fileName: "styles.css", contentType: "text/css; charset=utf-8" }],
  ["/app.js", { fileName: "app.js", contentType: "text/javascript; charset=utf-8" }]
]);

/**
 * Reads the optional port setting without accepting an accidental network bind.
 * Only the numeric port is configurable; the listener always stays on loopback.
 */
export function resolvePreviewPort(rawPort = process.env.DOORSTAR_UI_PREVIEW_PORT) {
  if (rawPort === undefined || rawPort === "") {
    return DEFAULT_PORT;
  }

  if (!/^[0-9]+$/.test(rawPort)) {
    throw new Error("DOORSTAR_UI_PREVIEW_PORT must be an integer between 1 and 65535.");
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DOORSTAR_UI_PREVIEW_PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function setSecurityHeaders(response) {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'"
  );
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function writePlainText(response, statusCode, body) {
  setSecurityHeaders(response);
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

async function serveStaticAsset(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    writePlainText(response, 405, "Method not allowed");
    return;
  }

  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  const asset = staticAssets.get(requestUrl.pathname);
  if (!asset) {
    writePlainText(response, 404, "Not found");
    return;
  }

  try {
    const body = await readFile(join(publicDirectory, asset.fileName));
    setSecurityHeaders(response);
    response.writeHead(200, { "Content-Type": asset.contentType });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    writePlainText(response, 500, "The local preview asset could not be read.");
    console.error("[doorstar-ui-preview] static asset error", error);
  }
}

function createPreviewServer() {
  return createServer((request, response) => {
    void serveStaticAsset(request, response);
  });
}

/**
 * Starts an isolated visual preview. Passing another host is deliberately
 * rejected so this utility cannot become a LAN or public web server.
 */
export async function startPreviewServer({
  host = LOOPBACK_HOST,
  port = resolvePreviewPort(),
  logger = console
} = {}) {
  if (host !== LOOPBACK_HOST) {
    throw new Error("The visual preview may listen only on 127.0.0.1.");
  }

  const server = createPreviewServer();

  await new Promise((resolveStart, rejectStart) => {
    const onError = (error) => {
      server.off("listening", onListening);
      rejectStart(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveStart();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host, port });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise((resolveClose) => server.close(resolveClose));
    throw new Error("The local preview server did not return a TCP address.");
  }

  const url = "http://" + LOOPBACK_HOST + ":" + address.port;
  logger.info("[doorstar-ui-preview] Visual preview: " + url);
  logger.info("[doorstar-ui-preview] Loopback-only; no authentication or data connection is enabled.");

  return { server, url };
}

const launchedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (launchedDirectly) {
  startPreviewServer().catch((error) => {
    console.error("[doorstar-ui-preview] Could not start the local preview.", error);
    process.exitCode = 1;
  });
}
