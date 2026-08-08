import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Keep the hosted-demo profile deterministic. The release procedure calls this
// script instead of relying on an operator to export a shell environment flag.
const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const arguments_ = process.platform === "win32"
  ? ["/d", "/s", "/c", "npm run build"]
  : ["run", "build"];
const build = spawnSync(command, arguments_, {
  cwd: process.cwd(),
  env: { ...process.env, VITE_READ_ONLY_DEMO: "true" },
  stdio: "inherit",
});

if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const indexPath = resolve(process.cwd(), "dist", "index.html");
const indexHtml = readFileSync(indexPath, "utf8");
if (!indexHtml.includes('name="doorstar-read-only-demo" content="true"')) {
  throw new Error("read-only demo build marker is missing from dist/index.html");
}

console.info("read-only demo build marker verified");
