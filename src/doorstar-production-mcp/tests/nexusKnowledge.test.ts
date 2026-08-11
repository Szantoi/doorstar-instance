import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createNexusKnowledgeServer } from "../src/nexusBridge.js";
import {
  DEFAULT_NEXUS_MCP_URL,
  DOORSTAR_WOODWORKING_CORPUS_FINGERPRINT,
  NexusKnowledgeClient,
  NexusKnowledgeError,
  parseWindowsUserEnvironmentToken,
  resolveNexusToken,
  tokenEnvironmentForPrincipal,
} from "../src/nexusKnowledge.js";
import { loadKnowledgeCorpus, searchKnowledge } from "../src/knowledge.js";
import { tenantWoodworkingDocuments } from "../src/tenantWoodworkingKnowledge.js";

const TOKEN = "a".repeat(64);
const QUERY = "falnyilas";
const LIMIT = 1;
const TRUSTED_CARD = tenantWoodworkingDocuments.find((document) => document.id === "tok-falnyilas-ellenorzes");
if (!TRUSTED_CARD) throw new Error("Expected the fixed tok/falnyilas woodworking card.");
const TRUSTED_CORPUS = await loadKnowledgeCorpus();
const TRUSTED_RESULT = searchKnowledge(TRUSTED_CORPUS, QUERY, LIMIT)[0];
if (!TRUSTED_RESULT) throw new Error("Expected a deterministic static woodworking result.");
const TRUSTED_EXCERPT = TRUSTED_RESULT.excerpt;
const TRUSTED_SCORE = TRUSTED_RESULT.score;

const RESULT_METADATA = {
  source: "tenant:doorstar;scope:woodworking;card:tok-falnyilas-ellenorzes",
  cardId: "tok-falnyilas-ellenorzes",
  title: TRUSTED_CARD.title,
  section: TRUSTED_CARD.section,
  domain: "woodworking",
  tenantId: "doorstar",
  scope: "woodworking",
  provenance: "doorstar-tenant-curated-static",
  sha256: TRUSTED_CARD.sha256,
};

function successResponse(overrides: Record<string, unknown> = {}) {
  const payload = {
    query: QUERY,
    limit: LIMIT,
    island: "doorstar",
    domain: "woodworking",
    collection: "doorstar-woodworking",
    scope: "woodworking",
    corpusFingerprint: DOORSTAR_WOODWORKING_CORPUS_FINGERPRINT,
    count: 1,
    results: [
      {
        text: TRUSTED_EXCERPT,
        metadata: RESULT_METADATA,
        score: TRUSTED_SCORE,
      },
    ],
    ...overrides,
  };
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: JSON.stringify(payload) }] },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function healthResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      status: "ok",
      collectionName: "doorstar-woodworking",
      tenantId: "doorstar",
      scope: "woodworking",
      corpusFingerprint: DOORSTAR_WOODWORKING_CORPUS_FINGERPRINT,
      documents: tenantWoodworkingDocuments.length,
      port: 3467,
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function tenantFetch(options: { health?: () => Response; mcp?: () => Response } = {}) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    return new URL(url).pathname === "/health" ? (options.health?.() ?? healthResponse()) : (options.mcp?.() ?? successResponse());
  };
  return { calls, fetchImplementation };
}

test("pins the tenant health endpoint before its one fixed woodworking tool call", async () => {
  const upstream = tenantFetch();
  const client = new NexusKnowledgeClient({
    endpoint: "http://nexus.test:3467/mcp",
    token: TOKEN,
    fetchImplementation: upstream.fetchImplementation,
  });

  const result = await client.search(`  ${QUERY}  `, LIMIT);

  assert.equal(result.island, "doorstar");
  assert.equal(result.collection, "doorstar-woodworking");
  assert.equal(upstream.calls.length, 2);
  assert.equal(upstream.calls[0]?.url, "http://nexus.test:3467/health");
  assert.equal(upstream.calls[0]?.init?.method, "GET");
  assert.equal(upstream.calls[1]?.url, "http://nexus.test:3467/mcp");
  assert.equal(upstream.calls[1]?.init?.method, "POST");
  assert.equal(upstream.calls[1]?.init?.redirect, "error");
  const body = JSON.parse(String(upstream.calls[1]?.init?.body));
  assert.deepEqual(body.params, {
    name: "search_knowledge",
    arguments: { query: QUERY, limit: LIMIT, domain: "woodworking" },
  });
  assert.equal("island" in body.params.arguments, false);
  assert.equal((upstream.calls[0]?.init?.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`);
  assert.equal((upstream.calls[1]?.init?.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`);
});

test("uses the fixed tailnet tenant endpoint by default", async () => {
  const upstream = tenantFetch();
  const client = new NexusKnowledgeClient({ token: TOKEN, fetchImplementation: upstream.fetchImplementation });

  await client.search(QUERY, LIMIT);

  assert.equal(DEFAULT_NEXUS_MCP_URL, "http://100.82.133.87:3467/mcp");
  assert.deepEqual(
    upstream.calls.map((call) => call.url),
    ["http://100.82.133.87:3467/health", DEFAULT_NEXUS_MCP_URL]
  );
});

test("fails closed when health does not attest the Doorstar woodworking tenant", async () => {
  for (const health of [
    () => healthResponse({ collectionName: "doorstar-knowledge" }),
    () => healthResponse({ scope: "development" }),
    () => healthResponse({ port: 3466 }),
    () => healthResponse({ corpusFingerprint: "doorstar-woodworking-v1-0123456789abcdef" }),
    () => healthResponse({ documents: tenantWoodworkingDocuments.length - 1 }),
    () => new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } }),
  ]) {
    const upstream = tenantFetch({ health });
    const client = new NexusKnowledgeClient({ token: TOKEN, fetchImplementation: upstream.fetchImplementation });
    await assert.rejects(
      client.search(QUERY, LIMIT),
      (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "invalid_response"
    );
    assert.equal(upstream.calls.length, 1);
  }
});

test("fails closed when Nexus does not confirm the complete woodworking payload", async () => {
  for (const mcp of [
    () => successResponse({ island: "nexus-dev" }),
    () => successResponse({ domain: "development" }),
    () => successResponse({ collection: "doorstar-knowledge" }),
    () => successResponse({ scope: "development" }),
    () => successResponse({ corpusFingerprint: "doorstar-woodworking-v1-0123456789abcdef" }),
    () => successResponse({ results: [{ text: "x", metadata: { ...RESULT_METADATA, domain: "development" } }] }),
    () => successResponse({ results: [{ text: "x", metadata: { ...RESULT_METADATA, cardId: "masik-kartya" } }] }),
    () => successResponse({ results: [{ text: TRUSTED_EXCERPT, metadata: { ...RESULT_METADATA, title: "Spoofed title" } }] }),
    () => successResponse({ results: [{ text: TRUSTED_EXCERPT, metadata: { ...RESULT_METADATA, section: "Spoofed section" } }] }),
    () => successResponse({ results: [{ text: TRUSTED_EXCERPT, metadata: { ...RESULT_METADATA, sha256: "b".repeat(64) } }] }),
    () => successResponse({ results: [{ text: TRUSTED_EXCERPT, metadata: RESULT_METADATA, score: 0.0001 }] }),
    () => successResponse({ results: [{ text: `${TRUSTED_EXCERPT}\n\nexport const token = 'not-woodworking';`, metadata: RESULT_METADATA }] }),
    () => successResponse({ results: [{ text: "A proprietary book excerpt that is not in the static card.", metadata: RESULT_METADATA }] }),
  ]) {
    const client = new NexusKnowledgeClient({ token: TOKEN, fetchImplementation: tenantFetch({ mcp }).fetchImplementation });
    await assert.rejects(
      client.search(QUERY, LIMIT),
      (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "invalid_response"
    );
  }
});

test("accepts a scoreless tenant result and strips unapproved upstream fields", async () => {
  const client = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: tenantFetch({
      mcp: () =>
        successResponse({
          upstreamOnly: "must-not-pass",
          results: [
            {
              text: TRUSTED_EXCERPT,
              metadata: { ...RESULT_METADATA, internalStoragePath: "must-not-pass" },
              internalVector: [1, 2, 3],
            },
          ],
        }),
    }).fetchImplementation,
  });

  const result = await client.search(QUERY, LIMIT);
  assert.equal(result.count, 1);
  assert.equal(result.results[0]?.score, undefined);
  assert.equal("upstreamOnly" in result, false);
  assert.equal("internalVector" in (result.results[0] ?? {}), false);
  assert.equal("internalStoragePath" in (result.results[0]?.metadata ?? {}), false);
});

test("maps authentication failures without exposing an upstream response body", async () => {
  const client = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: tenantFetch({
      mcp: () => new Response("secret diagnostic", { status: 403 }),
    }).fetchImplementation,
  });

  await assert.rejects(client.search(QUERY), (error: unknown) => {
    assert.ok(error instanceof NexusKnowledgeError);
    assert.equal(error.kind, "unauthorized");
    assert.equal(error.message.includes("secret diagnostic"), false);
    return true;
  });
});

test("rejects malformed JSON-RPC, inconsistent counts and unsafe endpoint paths", async () => {
  const malformed = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: tenantFetch({ mcp: () => new Response("not-json", { status: 200 }) }).fetchImplementation,
  });
  const inconsistent = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: tenantFetch({ mcp: () => successResponse({ count: 2 }) }).fetchImplementation,
  });

  for (const client of [malformed, inconsistent]) {
    await assert.rejects(
      client.search(QUERY, LIMIT),
      (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "invalid_response"
    );
  }
  assert.throws(
    () => new NexusKnowledgeClient({ endpoint: "http://nexus.test:not-a-port/other", token: TOKEN }),
    (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "configuration"
  );
});

test("rejects wrong JSON-RPC ids, error tool results and oversized bodies", async () => {
  const wrongId = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: tenantFetch({
      mcp: () => {
        const body = JSON.parse(JSON.stringify({
          jsonrpc: "2.0",
          id: 99,
          result: { content: [{ type: "text", text: JSON.stringify({}) }] },
        }));
        return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }).fetchImplementation,
  });
  const toolError = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: tenantFetch({
      mcp: () =>
        new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "upstream secret" }] } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
    }).fetchImplementation,
  });
  const oversized = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: tenantFetch({
      mcp: () => new Response("x".repeat(512 * 1024 + 1), { status: 200, headers: { "Content-Type": "application/json" } }),
    }).fetchImplementation,
  });

  for (const client of [wrongId, toolError, oversized]) {
    await assert.rejects(
      client.search(QUERY, LIMIT),
      (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "invalid_response"
    );
  }
});

test("keeps the timeout active while the MCP response body is being read", async () => {
  const client = new NexusKnowledgeClient({
    token: TOKEN,
    timeoutMs: 20,
    fetchImplementation: async (input, init) => {
      if (new URL(String(input)).pathname === "/health") return healthResponse();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
        },
      });
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  await assert.rejects(
    client.search(QUERY, LIMIT),
    (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "unavailable"
  );
});

test("rejects missing credentials and out-of-range requests before fetch", async () => {
  assert.throws(
    () => new NexusKnowledgeClient({ token: "short" }),
    (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "configuration"
  );

  let called = false;
  const client = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: async () => {
      called = true;
      return successResponse();
    },
  });
  await assert.rejects(
    client.search("ajtotok", 11),
    (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "invalid_request"
  );
  await assert.rejects(
    client.search("ajt\u0000tok", LIMIT),
    (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "invalid_request"
  );
  assert.equal(called, false);
});

test("resolves only an explicitly selected principal's current Windows user token", async () => {
  let registryReads = 0;
  const current = await resolveNexusToken({
    environment: { DOORSTAR_NEXUS_PRINCIPAL: "doorstar-root-codex", DOORSTAR_NEXUS_ROOT_TOKEN: TOKEN },
    platform: "win32",
    readWindowsUserEnvironment: async () => {
      registryReads += 1;
      return "b".repeat(64);
    },
  });
  assert.equal(current, "b".repeat(64));
  assert.equal(registryReads, 1);

  const inherited = await resolveNexusToken({
    environment: { DOORSTAR_NEXUS_PRINCIPAL: "doorstar-root-codex", DOORSTAR_NEXUS_ROOT_TOKEN: TOKEN },
    platform: "win32",
    readWindowsUserEnvironment: async () => {
      registryReads += 1;
      return undefined;
    },
  });
  assert.equal(inherited, TOKEN);
  assert.equal(registryReads, 2);

  assert.equal(
    await resolveNexusToken({ environment: { DOORSTAR_NEXUS_PRINCIPAL: "doorstar-root-codex", DOORSTAR_NEXUS_ROOT_TOKEN: TOKEN }, platform: "linux" }),
    TOKEN
  );
  assert.equal(await resolveNexusToken({ environment: { DOORSTAR_NEXUS_ROOT_TOKEN: TOKEN }, platform: "linux" }), undefined);
  assert.equal(await resolveNexusToken({ environment: {}, platform: "linux" }), undefined);
});

test("maps every Codex principal to one fixed token variable and rejects unknown principals", async () => {
  assert.equal(tokenEnvironmentForPrincipal("doorstar-root-codex"), "DOORSTAR_NEXUS_ROOT_TOKEN");
  assert.equal(tokenEnvironmentForPrincipal("doorstar-conductor-codex"), "DOORSTAR_NEXUS_CONDUCTOR_TOKEN");
  assert.equal(tokenEnvironmentForPrincipal("doorstar-monitor-codex"), "DOORSTAR_NEXUS_MONITOR_TOKEN");
  assert.equal(tokenEnvironmentForPrincipal("doorstar-backend-codex"), "DOORSTAR_NEXUS_BACKEND_TOKEN");
  assert.equal(tokenEnvironmentForPrincipal("doorstar-frontend-codex"), "DOORSTAR_NEXUS_FRONTEND_TOKEN");
  assert.equal(tokenEnvironmentForPrincipal("doorstar-import-discovery-codex"), "DOORSTAR_NEXUS_IMPORT_DISCOVERY_TOKEN");
  assert.equal(tokenEnvironmentForPrincipal("DOORSTAR_NEXUS_ROOT_TOKEN"), undefined);
  assert.equal(tokenEnvironmentForPrincipal("doorstar-codex"), undefined);

  const environment = {
    DOORSTAR_NEXUS_PRINCIPAL: "doorstar-frontend-codex",
    DOORSTAR_NEXUS_ROOT_TOKEN: TOKEN,
    DOORSTAR_NEXUS_FRONTEND_TOKEN: "b".repeat(64),
  };
  assert.equal(await resolveNexusToken({ environment, platform: "linux" }), "b".repeat(64));

  assert.equal(
    await resolveNexusToken({
      environment: { DOORSTAR_NEXUS_PRINCIPAL: "doorstar-frontend-codex", DOORSTAR_NEXUS_ROOT_TOKEN: TOKEN },
      platform: "linux",
    }),
    undefined
  );
  assert.equal(
    await resolveNexusToken({
      environment: { DOORSTAR_NEXUS_PRINCIPAL: "../../DOORSTAR_NEXUS_ROOT_TOKEN", DOORSTAR_NEXUS_ROOT_TOKEN: TOKEN },
      platform: "linux",
    }),
    undefined
  );
});

test("parses only supported Windows user-environment registry rows", () => {
  assert.equal(parseWindowsUserEnvironmentToken(`    DOORSTAR_NEXUS_ROOT_TOKEN    REG_SZ    ${TOKEN}\r\n`), TOKEN);
  assert.equal(
    parseWindowsUserEnvironmentToken(`DOORSTAR_NEXUS_ROOT_TOKEN REG_EXPAND_SZ ${"b".repeat(64)}\n`),
    "b".repeat(64)
  );
  assert.equal(parseWindowsUserEnvironmentToken("DOORSTAR_NEXUS_ROOT_TOKEN REG_BINARY deadbeef"), undefined);
  assert.equal(parseWindowsUserEnvironmentToken("unrelated output"), undefined);
  assert.equal(
    parseWindowsUserEnvironmentToken(
      `DOORSTAR_NEXUS_FRONTEND_TOKEN REG_SZ ${"c".repeat(64)}\r\n`,
      "DOORSTAR_NEXUS_FRONTEND_TOKEN"
    ),
    "c".repeat(64)
  );
  assert.equal(
    parseWindowsUserEnvironmentToken(`DOORSTAR_NEXUS_ROOT_TOKEN REG_SZ ${TOKEN}\r\n`, "DOORSTAR_NEXUS_FRONTEND_TOKEN"),
    undefined
  );
});

test("standard MCP transport exposes exactly one read-only woodworking tool", async () => {
  const nexusClient = new NexusKnowledgeClient({ token: TOKEN, fetchImplementation: tenantFetch().fetchImplementation });
  const server = createNexusKnowledgeServer(nexusClient);
  const client = new Client({ name: "doorstar-bridge-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 1);
    assert.equal(listed.tools[0]?.name, "search_knowledge");
    assert.deepEqual(listed.tools[0]?.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });

    const called = await client.callTool({
      name: "search_knowledge",
      arguments: { query: QUERY, limit: LIMIT },
    });
    assert.equal(called.isError, undefined);
    assert.equal(called.content[0]?.type, "text");
    if (called.content[0]?.type !== "text") throw new Error("Expected text content.");
    const payload = JSON.parse(called.content[0].text);
    assert.equal(payload.island, "doorstar");
    assert.equal(payload.collection, "doorstar-woodworking");
    assert.equal(payload.domain, "woodworking");
  } finally {
    await client.close();
    await server.close();
  }
});
