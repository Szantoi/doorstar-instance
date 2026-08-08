import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp();
const projectKey = "FLOW-LAB-GUARD";
const snapshotId = "flow_lab_snapshot_guard";

describe("Flow Lab HTTP fail-closed guards", () => {
  it("requires an explicit reader role before a snapshot lookup can reach persistence", async () => {
    const response = await request(app)
      .get(`/api/production/flow-lab/projects/${projectKey}/plan-snapshots`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "flow_lab_role_required" });
  });

  it("rejects an unpermitted explicit role before a deviation lookup can reach persistence", async () => {
    const response = await request(app)
      .get(`/api/production/flow-lab/projects/${projectKey}/deviations`)
      .set("X-Role", "sales");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "role_not_permitted" });
  });

  it("requires a declared principal after a permitted reviewer role", async () => {
    const response = await request(app)
      .patch(`/api/production/flow-lab/projects/${projectKey}/plan-snapshots/${snapshotId}/review`)
      .set("X-Role", "production_planner")
      .send({
        state: "VERIFIED",
        resolution: "Independent Flow Lab review completed",
        expectedContentHash: "a".repeat(64),
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "flow_lab_principal_required" });
  });
});
