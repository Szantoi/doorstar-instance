import { verifyTwoScopeFixtureSources } from "../src/fixture/fixtureVerifier.js";

const report = await verifyTwoScopeFixtureSources();
process.stdout.write(`${JSON.stringify({
  package: "@doorstar/pilot-staging-proof",
  fixture: "two-scope-preflight",
  verification: "PASS",
  fixtureSha256: report.fixtureSha256,
  renderedFixtureSha256: report.renderedFixtureSha256,
  functions: report.functions,
}, null, 2)}\n`);
