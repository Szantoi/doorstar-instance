import { verifyHarnessBoundary } from "../src/runner/harnessBoundary.js";

const report = await verifyHarnessBoundary();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
