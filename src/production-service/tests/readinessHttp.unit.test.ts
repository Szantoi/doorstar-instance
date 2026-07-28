import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /readyz", () => {
  it("returns ready only when the injected database probe succeeds", async () => {
    const response = await request(createApp({ runDatabaseProbe: async () => undefined }))
      .get("/readyz")
      .expect("content-type", /application\/json/)
      .expect(200);

    expect(response.body).toEqual({ status: "ready" });
  });

  it("fails closed without exposing the database error", async () => {
    const response = await request(createApp({ runDatabaseProbe: async () => {
      throw new Error("connection string details must remain private");
    } }))
      .get("/readyz")
      .expect("content-type", /application\/json/)
      .expect(503);

    expect(response.body).toEqual({ status: "not_ready" });
    expect(JSON.stringify(response.body)).not.toContain("connection string");
  });
});
