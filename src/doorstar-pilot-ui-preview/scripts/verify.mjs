import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  LOOPBACK_HOST,
  resolvePreviewPort,
  startPreviewServer
} from "./serve.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const previewDirectory = join(scriptDirectory, "..");
const publicDirectory = join(previewDirectory, "public");

function quietLogger() {
  // The verifier owns its concise evidence line below.
}

async function closeServer(server) {
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

async function verifyStaticContent() {
  const [packageText, indexText, appText, styleText, serverText] = await Promise.all([
    readFile(join(previewDirectory, "package.json"), "utf8"),
    readFile(join(publicDirectory, "index.html"), "utf8"),
    readFile(join(publicDirectory, "app.js"), "utf8"),
    readFile(join(publicDirectory, "styles.css"), "utf8"),
    readFile(join(scriptDirectory, "serve.mjs"), "utf8")
  ]);

  const packageJson = JSON.parse(packageText);
  assert.equal(packageJson.scripts.dev, "node scripts/serve.mjs");
  assert.equal(packageJson.scripts.verify, "node scripts/verify.mjs");
  assert.match(indexText, /Helyi vizuális előnézet — nincs bejelentkezés vagy adatkapcsolat/);
  assert.match(indexText, /id="preview-sign-in"[^>]*disabled/);
  assert.match(indexText, /data-view-target="dashboard"/);
  assert.match(appText, /const previewData/);
  assert.match(styleText, /\.preview-notice/);
  assert.match(serverText, /const LOOPBACK_HOST = "127\.0\.0\.1"/);
  assert.match(serverText, /connect-src 'none'/);
}

async function verifyRunningServer() {
  const { server, url } = await startPreviewServer({
    host: LOOPBACK_HOST,
    port: 0,
    logger: { info: quietLogger }
  });

  try {
    const [indexResponse, stylesheetResponse, appResponse, apiResponse] = await Promise.all([
      fetch(url + "/"),
      fetch(url + "/styles.css"),
      fetch(url + "/app.js"),
      fetch(url + "/api/auth/start")
    ]);

    assert.equal(indexResponse.status, 200);
    assert.equal(stylesheetResponse.status, 200);
    assert.equal(appResponse.status, 200);
    assert.equal(apiResponse.status, 404);
    assert.match(indexResponse.headers.get("content-security-policy") ?? "", /connect-src 'none'/);
    assert.match(await indexResponse.text(), /Doorstar Office/);
  } finally {
    await closeServer(server);
  }
}

async function verifyLoopbackBoundary() {
  assert.throws(
    () => resolvePreviewPort("not-a-port"),
    /must be an integer between 1 and 65535/
  );
  await assert.rejects(
    () => startPreviewServer({ host: "0.0.0.0", port: 0, logger: { info: quietLogger } }),
    /may listen only on 127\.0\.0\.1/
  );
}

try {
  await verifyStaticContent();
  await verifyLoopbackBoundary();
  await verifyRunningServer();
  console.log("[doorstar-ui-preview] PASS: static preview, loopback-only listener, and no API route verified.");
} catch (error) {
  console.error("[doorstar-ui-preview] FAIL:", error);
  process.exitCode = 1;
}
