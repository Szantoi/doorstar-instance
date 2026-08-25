const { existsSync, readdirSync } = require("node:fs");
const { basename, relative, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = resolve(__dirname, "..");
const buildDirectory = resolve(projectRoot, "dist");
const bffDirectory = resolve(buildDirectory, "services", "identityAuthority", "bff");

assertDirectBuildChild(buildDirectory);
assertDescendant(buildDirectory, bffDirectory);

const verifierPath = resolve(bffDirectory, "humanJwtVerifier.js");
if (!existsSync(verifierPath)) {
  throw new Error("Compiled human JWT verifier is missing from the build artifact.");
}

const staleContractArtifacts = readdirSync(bffDirectory)
  .filter((entry) => entry.startsWith("humanOidcContract."));
if (staleContractArtifacts.length > 0) {
  throw new Error(`Stale pre-verification contract artifact found: ${staleContractArtifacts.join(", ")}`);
}

verifyRuntimeExports().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function verifyRuntimeExports() {
  const module = await import(pathToFileURL(verifierPath).href);
  const runtimeExports = Object.keys(module).sort();
  const expectedExports = ["createDoorstarHumanJwtVerifier"];
  if (runtimeExports.length !== expectedExports.length
    || runtimeExports.some((value, index) => value !== expectedExports[index])) {
    throw new Error(`Unexpected compiled human JWT verifier exports: ${runtimeExports.join(", ")}`);
  }
}

function assertDirectBuildChild(value) {
  if (relative(projectRoot, value) !== "dist" || basename(value) !== "dist") {
    throw new Error("Unexpected compiled build directory.");
  }
}

function assertDescendant(parent, value) {
  const path = relative(parent, value);
  if (path.length === 0 || path.startsWith("..") || /^[/\\]/u.test(path)) {
    throw new Error("Unexpected compiled BFF directory.");
  }
}
