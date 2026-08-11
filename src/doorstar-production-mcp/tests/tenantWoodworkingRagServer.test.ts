import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { NexusKnowledgeClient } from "../src/nexusKnowledge.js";
import {
  DOORSTAR_WOODWORKING_CONFIG_FILE,
  DOORSTAR_WOODWORKING_PORT,
  DOORSTAR_WOODWORKING_TAILNET_HOST,
  loadProductionTenantWoodworkingConfiguration,
  parseTenantWoodworkingRagConfig,
  productionListenOptions,
  startTenantWoodworkingRagServer,
  TENANT_HEADERS_TIMEOUT_MS,
  TENANT_KEEP_ALIVE_TIMEOUT_MS,
  TENANT_MAX_CONNECTIONS,
  TENANT_MAX_HEADER_COUNT,
  TENANT_MAX_REQUESTS_PER_SOCKET,
  TENANT_REQUEST_TIMEOUT_MS,
  TENANT_SOCKET_TIMEOUT_MS,
} from "../src/tenantWoodworkingRagServer.js";

const TOKEN = "a".repeat(96);
const CONFIG = {
  tenantId: "doorstar",
  scope: "woodworking",
  agents: {
    [TOKEN]: "doorstar-root-codex",
    ["b".repeat(96)]: "doorstar-conductor-codex",
    ["c".repeat(96)]: "doorstar-monitor-codex",
    ["d".repeat(96)]: "doorstar-backend-codex",
    ["e".repeat(96)]: "doorstar-frontend-codex",
    ["f".repeat(96)]: "doorstar-import-discovery-codex",
  },
} as const;

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const started = await startTenantWoodworkingRagServer(CONFIG, { host: "127.0.0.1", port: 0 });
  const address = started.server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP test listener.");
  const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  try {
    await run(baseUrl);
  } finally {
    await started.close();
  }
}

async function mcp(
  baseUrl: string,
  id: number,
  method: string,
  params: unknown,
  token: string | undefined = TOKEN
): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

test("returns only scoped woodworking knowledge with safe synthetic sources", async () => {
  await withServer(async (baseUrl) => {
    const response = await mcp(baseUrl, 1, "tools/call", {
      name: "search_knowledge",
      arguments: { query: "ajtótok falnyílás borítás", limit: 3, domain: "woodworking" },
    });
    assert.equal(response.status, 200);
    const rpc = await response.json();
    const payload = JSON.parse((rpc.result.content[0] as { text: string }).text);

    assert.deepEqual(Object.keys(payload), ["query", "limit", "island", "domain", "collection", "scope", "corpusFingerprint", "count", "results"]);
    assert.equal(payload.query, "ajtótok falnyílás borítás");
    assert.equal(payload.limit, 3);
    assert.equal(payload.island, "doorstar");
    assert.equal(payload.domain, "woodworking");
    assert.equal(payload.collection, "doorstar-woodworking");
    assert.equal(payload.scope, "woodworking");
    assert.match(payload.corpusFingerprint, /^doorstar-woodworking-v1-[a-f0-9]{16}$/);
    assert.ok(payload.count > 0);
    assert.equal(payload.count, payload.results.length);
    assert.ok(
      payload.results.every(
        (result: {
          metadata: {
            source: string;
            cardId: string;
            title: string;
            section: string;
            domain: string;
            tenantId: string;
            scope: string;
            provenance: string;
            sha256: string;
          };
        }) =>
          result.metadata.source === `tenant:doorstar;scope:woodworking;card:${result.metadata.cardId}` &&
          /^[a-z0-9][a-z0-9-]*$/.test(result.metadata.cardId) &&
          result.metadata.title.length > 0 &&
          result.metadata.section.length > 0 &&
          result.metadata.domain === "woodworking" &&
          result.metadata.tenantId === "doorstar" &&
          result.metadata.scope === "woodworking" &&
          result.metadata.provenance === "doorstar-tenant-curated-static" &&
          /^[a-f0-9]{64}$/.test(result.metadata.sha256)
      )
    );
  });
});

test("bounds Tailnet HTTP connections and request lifetime", async () => {
  const started = await startTenantWoodworkingRagServer(CONFIG, { host: "127.0.0.1", port: 0 });
  try {
    assert.equal(started.server.headersTimeout, TENANT_HEADERS_TIMEOUT_MS);
    assert.equal(started.server.requestTimeout, TENANT_REQUEST_TIMEOUT_MS);
    assert.equal(started.server.timeout, TENANT_SOCKET_TIMEOUT_MS);
    assert.equal(started.server.keepAliveTimeout, TENANT_KEEP_ALIVE_TIMEOUT_MS);
    assert.equal(started.server.maxConnections, TENANT_MAX_CONNECTIONS);
    assert.equal(started.server.maxRequestsPerSocket, TENANT_MAX_REQUESTS_PER_SOCKET);
    assert.equal(started.server.maxHeadersCount, TENANT_MAX_HEADER_COUNT);
  } finally {
    await started.close();
  }
});

test("production accepts only its fixed credential file, never a token environment payload", async () => {
  let reads = 0;
  await assert.rejects(
    () =>
      loadProductionTenantWoodworkingConfiguration({
        environment: { DOORSTAR_TENANT_WOODWORKING_RAG_CONFIG_JSON: JSON.stringify(CONFIG) },
        readConfigurationFile: async () => {
          reads += 1;
          return JSON.stringify(CONFIG);
        },
      }),
    /Required tenant woodworking RAG runtime configuration is missing/
  );
  assert.equal(reads, 0);

  const configuration = await loadProductionTenantWoodworkingConfiguration({
    environment: { DOORSTAR_TENANT_WOODWORKING_RAG_CONFIG_FILE: DOORSTAR_WOODWORKING_CONFIG_FILE },
    readConfigurationFile: async (filePath) => {
      assert.equal(filePath, DOORSTAR_WOODWORKING_CONFIG_FILE);
      return JSON.stringify(CONFIG);
    },
  });
  assert.equal(configuration, JSON.stringify(CONFIG));
});

test("accepts only the exact token format emitted by credential provisioning", () => {
  const { [TOKEN]: _rootAgent, ...otherAgents } = CONFIG.agents;
  for (const replacement of ["a".repeat(95), "g".repeat(96)]) {
    assert.throws(() =>
      parseTenantWoodworkingRagConfig({
        tenantId: "doorstar",
        scope: "woodworking",
        agents: { [replacement]: "doorstar-root-codex", ...otherAgents },
      })
    );
  }
});

test("code and development queries return no tenant woodworking results", async () => {
  await withServer(async (baseUrl) => {
    const response = await mcp(baseUrl, 2, "tools/call", {
      name: "search_knowledge",
      arguments: { query: "fejlesztői forráskód repository API konfiguráció", limit: 5 },
    });
    const rpc = await response.json();
    const payload = JSON.parse((rpc.result.content[0] as { text: string }).text);
    assert.equal(response.status, 200);
    assert.equal(payload.count, 0);
    assert.deepEqual(payload.results, []);
  });
});

test("rejects unauthenticated MCP requests before parsing the tool call", async () => {
  await withServer(async (baseUrl) => {
    const response = await mcp(
      baseUrl,
      3,
      "tools/call",
      { name: "search_knowledge", arguments: { query: "ajtótok" } },
      ""
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  });
});

test("initializes and exposes exactly one read-only tool", async () => {
  await withServer(async (baseUrl) => {
    const initialized = await mcp(baseUrl, 4, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "tenant-rag-test", version: "1.0.0" },
    });
    assert.equal(initialized.status, 200);
    const initRpc = await initialized.json();
    assert.equal(initRpc.result.protocolVersion, "2025-11-25");
    assert.deepEqual(initRpc.result.capabilities, { tools: {} });

    const response = await mcp(baseUrl, 5, "tools/list", {});
    const rpc = await response.json();
    assert.equal(response.status, 200);
    assert.equal(rpc.result.tools.length, 1);
    assert.equal(rpc.result.tools[0].name, "search_knowledge");
    assert.deepEqual(rpc.result.tools[0].annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    assert.equal("domain" in rpc.result.tools[0].inputSchema.properties, false);
  });
});

test("forbids an unlisted tool using the bridge-compatible JSON-RPC error", async () => {
  await withServer(async (baseUrl) => {
    const response = await mcp(baseUrl, 6, "tools/call", { name: "read_file", arguments: {} });
    assert.equal(response.status, 403);
    const rpc = await response.json();
    assert.equal(rpc.error.code, -32003);
  });
});

test("health exposes only safe tenant status and no source paths", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.deepEqual(Object.keys(health), ["status", "collectionName", "tenantId", "scope", "corpusFingerprint", "documents", "port"]);
    assert.equal(health.status, "ok");
    assert.equal(health.collectionName, "doorstar-woodworking");
    assert.equal(health.tenantId, "doorstar");
    assert.equal(health.scope, "woodworking");
    assert.equal(health.port, 3467);
    assert.equal("paths" in health, false);
    assert.doesNotMatch(JSON.stringify(health), /(?:[A-Za-z]:[\\/]|[\\/](?:src|tmp|Users|documents))/i);
  });
});

test("rejects unauthenticated health discovery", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  });
});

test("satisfies the dedicated Nexus bridge's fixed health and payload attestation", async () => {
  await withServer(async (baseUrl) => {
    const client = new NexusKnowledgeClient({ endpoint: `${baseUrl}/mcp`, token: TOKEN });
    const payload = await client.search("ajtótok falnyílás", 2);
    assert.equal(payload.collection, "doorstar-woodworking");
    assert.match(payload.corpusFingerprint, /^doorstar-woodworking-v1-[a-f0-9]{16}$/);
    assert.ok(payload.results.length > 0);
  });
});

test("production entry point fails closed unless it uses the assigned Tailnet endpoint", () => {
  assert.deepEqual(
    productionListenOptions({
      DOORSTAR_TENANT_WOODWORKING_RAG_HOST: DOORSTAR_WOODWORKING_TAILNET_HOST,
      DOORSTAR_TENANT_WOODWORKING_RAG_PORT: String(DOORSTAR_WOODWORKING_PORT),
    }),
    { host: DOORSTAR_WOODWORKING_TAILNET_HOST, port: DOORSTAR_WOODWORKING_PORT }
  );
  assert.throws(() => productionListenOptions({ DOORSTAR_TENANT_WOODWORKING_RAG_HOST: "0.0.0.0" }));
  assert.throws(() => productionListenOptions({ DOORSTAR_TENANT_WOODWORKING_RAG_HOST: DOORSTAR_WOODWORKING_TAILNET_HOST, DOORSTAR_TENANT_WOODWORKING_RAG_PORT: "3466" }));
});
