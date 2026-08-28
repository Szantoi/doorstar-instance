import assert from "node:assert/strict";
import { request } from "node:http";
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

function requestRawPath(url, path) {
  const target = new URL(url);

  return new Promise((resolveResponse, rejectResponse) => {
    const clientRequest = request({
      hostname: target.hostname,
      port: target.port,
      path,
      method: "GET"
    }, (response) => {
      response.resume();
      response.once("end", () => resolveResponse(response));
    });

    clientRequest.once("error", rejectResponse);
    clientRequest.end();
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
  assert.match(indexText, /Doorstar szervezeti fiók/);
  assert.match(indexText, /id="preview-open-dashboard"[^>]*data-view-target="dashboard"/);
  assert.match(indexText, /Csak a helyi minta nézetre lép; nem hitelesít és nem hoz létre munkamenetet\./);
  assert.match(indexText, /href="\/office\/projects\/DS-26133"/);
  assert.doesNotMatch(indexText, /<input\b/i);
  assert.doesNotMatch(indexText, /type="password"/i);
  assert.match(indexText, /data-view-target="dashboard"/);
  assert.match(indexText, /data-view-panel="project"/);
  assert.match(appText, /const previewData/);
  assert.match(appText, /const projectPreviewPath = "\/office\/projects\/DS-26133"/);
  assert.doesNotMatch(appText, /preview-sign-in/);
  assert.doesNotMatch(appText, /preview-open-dashboard/);
  assert.doesNotMatch(appText, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b/);
  assert.match(styleText, /\.preview-navigation-button/);
  assert.match(styleText, /\.preview-notice/);
  assert.match(serverText, /const LOOPBACK_HOST = "127\.0\.0\.1"/);
  assert.match(serverText, /"\/office\/projects\/DS-26133"/);
  assert.match(serverText, /connect-src 'none'/);
}

async function verifyRunningServer() {
  const { server, url } = await startPreviewServer({
    host: LOOPBACK_HOST,
    port: 0,
    logger: { info: quietLogger }
  });

  try {
    const [
      indexResponse,
      stylesheetResponse,
      appResponse,
      projectResponse,
      projectHeadResponse,
      malformedProjectResponse,
      nestedProjectResponse,
      apiResponse,
      authLoginResponse,
      authSessionResponse,
      postProjectResponse
    ] = await Promise.all([
      fetch(url + "/"),
      fetch(url + "/styles.css"),
      fetch(url + "/app.js"),
      fetch(url + "/office/projects/DS-26133"),
      fetch(url + "/office/projects/DS-26133", { method: "HEAD" }),
      fetch(url + "/office/projects/DS-12"),
      fetch(url + "/office/projects/DS-26133/extra"),
      fetch(url + "/api/auth/start"),
      fetch(url + "/auth/login"),
      fetch(url + "/auth/session"),
      fetch(url + "/office/projects/DS-26133", { method: "POST" })
    ]);
    const dotSegmentProjectResponse = await requestRawPath(
      url,
      "/office/projects/x/../DS-26133"
    );

    assert.equal(indexResponse.status, 200);
    assert.equal(stylesheetResponse.status, 200);
    assert.equal(appResponse.status, 200);
    assert.equal(projectResponse.status, 200);
    assert.equal(projectHeadResponse.status, 200);
    assert.equal(await projectHeadResponse.text(), "");
    assert.equal(malformedProjectResponse.status, 404);
    assert.equal(nestedProjectResponse.status, 404);
    assert.equal(dotSegmentProjectResponse.statusCode, 404);
    assert.equal(apiResponse.status, 404);
    assert.equal(authLoginResponse.status, 404);
    assert.equal(authSessionResponse.status, 404);
    assert.equal(postProjectResponse.status, 405);
    assert.equal(postProjectResponse.headers.get("allow"), "GET, HEAD");
    assert.match(indexResponse.headers.get("content-security-policy") ?? "", /connect-src 'none'/);
    assert.match(await indexResponse.text(), /Doorstar Office/);
    assert.match(await projectResponse.text(), /DS-26133/);
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
  console.log("[doorstar-ui-preview] PASS: static preview, explicit project fixture, loopback-only listener, and no API route verified.");
} catch (error) {
  console.error("[doorstar-ui-preview] FAIL:", error);
  process.exitCode = 1;
}
