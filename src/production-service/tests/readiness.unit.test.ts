import { describe, expect, it } from "vitest";
import { isServiceReady } from "../src/services/readiness.js";

describe("isServiceReady", () => {
  it("is ready when the database probe succeeds", async () => {
    await expect(isServiceReady(async () => 1)).resolves.toBe(true);
  });

  it("fails closed when the database probe fails", async () => {
    await expect(isServiceReady(async () => {
      throw new Error("database unavailable");
    })).resolves.toBe(false);
  });
});
