/**
 * Proves that compiled OpenAPI loading works without the source checkout's
 * root `openapi/` directory. `node dist/openapi.js` alone is insufficient:
 * that adjacent source asset would otherwise conceal a bad dist path.
 */
const { cpSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");

const verificationRoot = mkdtempSync(join(tmpdir(), "doorstar-openapi-dist-"));
try {
  cpSync("dist", join(verificationRoot, "dist"), { recursive: true });
  cpSync("package.json", join(verificationRoot, "package.json"));

  const moduleUrl = pathToFileURL(join(verificationRoot, "dist", "openapi.js")).href;
  const evaluation = [
    `import(${JSON.stringify(moduleUrl)})`,
    ".then(({ productionServiceOpenApi }) => {",
    "  if (productionServiceOpenApi?.openapi !== '3.1.0') process.exitCode = 1;",
    "})",
    ".catch((error) => { console.error(error); process.exitCode = 1; });",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", evaluation], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Compiled OpenAPI asset verification failed. ${result.stderr || result.stdout}`.trim());
  }
} finally {
  rmSync(verificationRoot, { recursive: true, force: true });
}
