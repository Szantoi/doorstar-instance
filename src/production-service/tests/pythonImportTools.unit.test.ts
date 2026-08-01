import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";

describe("Python import-tool regression suite", () => {
  it("passes every checked-in Python unit test", () => {
    const tests = readdirSync(join(process.cwd(), "tests"))
      .filter((name) => name.endsWith(".unit.test.py"))
      .sort();
    if (tests.length === 0) throw new Error("no Python import-tool tests found");
    for (const test of tests) {
      execFileSync("python", [join("tests", test)], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        stdio: "pipe",
      });
    }
  }, 60_000);
});
