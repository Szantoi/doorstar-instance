import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = resolve(serviceRoot, "openapi/production-service.openapi.json");

describe("OpenAPI contract endpoint", () => {
  it("serves the checked-in OpenAPI 3.1 source of truth without a database dependency", async () => {
    const expected = JSON.parse(readFileSync(specPath, "utf8"));

    const response = await request(createApp())
      .get("/openapi.json")
      .expect("content-type", /application\/json/)
      .expect(200);

    expect(response.body).toEqual(expected);
    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.info.title).toBe("Doorstar Production Service API");
  });
});
