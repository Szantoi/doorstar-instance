import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Keep the hosted-demo profile deterministic. The release procedure calls this
// script instead of relying on an operator to export a shell environment flag.
const flowLabReadonlyUrl = "https://doorstar.asztalostech.hu/flow-lab-demo/";
const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const arguments_ = process.platform === "win32"
  ? ["/d", "/s", "/c", "npm run build"]
  : ["run", "build"];
const build = spawnSync(command, arguments_, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VITE_READ_ONLY_DEMO: "true",
    VITE_FLOW_LAB_READONLY_URL: flowLabReadonlyUrl,
  },
  stdio: "inherit",
});

if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const indexPath = resolve(process.cwd(), "dist", "index.html");
const indexHtml = readFileSync(indexPath, "utf8");
if (!indexHtml.includes('name="doorstar-read-only-demo" content="true"')) {
  throw new Error("read-only demo build marker is missing from dist/index.html");
}

const assetsPath = resolve(process.cwd(), "dist", "assets");
const flowLabReadonlyUrlIncluded = readdirSync(assetsPath, { withFileTypes: true })
  .some((asset) => asset.isFile()
    && asset.name.endsWith(".js")
    && readFileSync(resolve(assetsPath, asset.name), "utf8").includes(flowLabReadonlyUrl));
if (!flowLabReadonlyUrlIncluded) {
  throw new Error("read-only demo Flow Lab URL is missing from the built assets");
}

console.info("read-only demo build marker and Flow Lab URL verified");
