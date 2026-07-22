import assert from "node:assert/strict";
import test from "node:test";
import { ProductionApi, ProductionApiError, currentMonday } from "../src/api.js";

test("currentMonday resolves a Sunday to the preceding Monday", () => {
  assert.equal(currentMonday(new Date(2026, 6, 26)), "2026-07-20");
});

test("ProductionApi only requests the approved GET endpoint", async () => {
  let receivedUrl = "";
  let receivedMethod = "";
  const api = new ProductionApi({
    baseUrl: "http://127.0.0.1:4610/api/production",
    fetchImplementation: async (input, init) => {
      receivedUrl = String(input);
      receivedMethod = init?.method ?? "";
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  assert.deepEqual(await api.getKanban("CNC & fúró", "2026-07-20"), { ok: true });
  assert.equal(receivedMethod, "GET");
  assert.match(receivedUrl, /kanban\?station=CNC/);
  assert.match(receivedUrl, /week=2026-07-20/);
});

test("ProductionApi maps a missing record to a safe not_found error", async () => {
  const api = new ProductionApi({
    fetchImplementation: async () => new Response(null, { status: 404 }),
  });
  await assert.rejects(api.getTask("missing"), (error: unknown) => error instanceof ProductionApiError && error.kind === "not_found");
});
