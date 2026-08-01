import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createNexusKnowledgeServer } from "../src/nexusBridge.js";
import {
  NexusKnowledgeClient,
  NexusKnowledgeError,
  parseWindowsUserEnvironmentToken,
  resolveNexusToken,
  tokenEnvironmentForPrincipal,
} from "../src/nexusKnowledge.js";

const TOKEN = "a".repeat(64);

function successResponse(overrides: Record<string, unknown> = {}) {
  const payload = {
    query: "ajtótok falvastagság",
    limit: 2,
    island: "doorstar",
    count: 1,
    results: [
      {
        text: "A tényleges falvastagság a beltéri ajtótok meghatározó mérete.",
        metadata: { source: "szega_book_134_oldal_008.jpg", page: 8, domain: "faipar-domain" },
        score: 0.91,
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

test("sends only the fixed read tool with query and bounded limit", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const client = new NexusKnowledgeClient({
    endpoint: "http://nexus.test:3466/mcp",
    token: TOKEN,
    fetchImplementation: async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return successResponse();
    },
  });

  const result = await client.search("  ajtótok falvastagság  ", 2);

  assert.equal(result.island, "doorstar");
  assert.equal(requestUrl, "http://nexus.test:3466/mcp");
  assert.equal(requestInit?.method, "POST");
  assert.equal(requestInit?.redirect, "error");
  const body = JSON.parse(String(requestInit?.body));
  assert.deepEqual(body.params, {
    name: "search_knowledge",
    arguments: { query: "ajtótok falvastagság", limit: 2 },
  });
  assert.equal("island" in body.params.arguments, false);
  assert.equal("domain" in body.params.arguments, false);
  assert.equal((requestInit?.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`);
});

test("fails closed when Nexus does not confirm the Doorstar island", async () => {
  const client = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: async () => successResponse({ island: "nexus-dev" }),
  });

  await assert.rejects(
    client.search("ajtótok falvastagság", 2),
    (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "invalid_response"
  );
});

test("accepts a scoreless result and strips unapproved upstream fields", async () => {
  const client = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: async () =>
      successResponse({
        upstreamOnly: "must-not-pass",
        results: [
          {
            text: "A tokborítás a beépítés után látható szerkezeti elem.",
            metadata: {
              source: "szega_book_134_oldal_124.jpg",
              page: 124,
              internalStoragePath: "must-not-pass",
            },
            internalVector: [1, 2, 3],
          },
        ],
      }),
  });

  const result = await client.search("ajtótok falvastagság", 2);
  assert.equal(result.count, 1);
  assert.equal(result.results[0]?.score, undefined);
  assert.equal("upstreamOnly" in result, false);
  assert.equal("internalVector" in (result.results[0] ?? {}), false);
  assert.equal("internalStoragePath" in (result.results[0]?.metadata ?? {}), false);
});

test("maps authentication failures without exposing an upstream response body", async () => {
  const client = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: async () => new Response("secret diagnostic", { status: 403 }),
  });

  await assert.rejects(client.search("ajtótok falvastagság"), (error: unknown) => {
    assert.ok(error instanceof NexusKnowledgeError);
    assert.equal(error.kind, "unauthorized");
    assert.equal(error.message.includes("secret diagnostic"), false);
    return true;
  });
});

test("rejects malformed JSON-RPC and inconsistent result counts", async () => {
  const malformed = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: async () => new Response("not-json", { status: 200 }),
  });
  const inconsistent = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: async () => successResponse({ count: 2 }),
  });

  await assert.rejects(
    malformed.search("ajtótok falvastagság"),
    (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "invalid_response"
  );
  await assert.rejects(
    inconsistent.search("ajtótok falvastagság", 2),
    (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "invalid_response"
  );
});

test("rejects wrong JSON-RPC ids, error tool results and oversized bodies", async () => {
  const wrongId = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: async () => {
      const response = successResponse();
      const body = JSON.parse(await response.text());
      body.id = 99;
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const toolError = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: async () =>
      new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "upstream secret" }] } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
  });
  const oversized = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: async () =>
      new Response("x".repeat(512 * 1024 + 1), { status: 200, headers: { "Content-Type": "application/json" } }),
  });

  for (const client of [wrongId, toolError, oversized]) {
    await assert.rejects(
      client.search("ajtótok falvastagság", 2),
      (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "invalid_response"
    );
  }
});

test("keeps the timeout active while the response body is being read", async () => {
  const client = new NexusKnowledgeClient({
    token: TOKEN,
    timeoutMs: 20,
    fetchImplementation: async (_input, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
        },
      });
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  await assert.rejects(
    client.search("ajtótok falvastagság", 2),
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
    client.search("ajtótok", 11),
    (error: unknown) => error instanceof NexusKnowledgeError && error.kind === "invalid_request"
  );
  assert.equal(called, false);
});

test("prefers the current Windows user token and falls back to an inherited token", async () => {
  let registryReads = 0;
  const current = await resolveNexusToken({
    environment: { DOORSTAR_NEXUS_ROOT_TOKEN: TOKEN },
    platform: "win32",
    readWindowsUserEnvironment: async () => {
      registryReads += 1;
      return "b".repeat(64);
    },
  });
  assert.equal(current, "b".repeat(64));
  assert.equal(registryReads, 1);

  const inherited = await resolveNexusToken({
    environment: { DOORSTAR_NEXUS_ROOT_TOKEN: TOKEN },
    platform: "win32",
    readWindowsUserEnvironment: async () => {
      registryReads += 1;
      return undefined;
    },
  });
  assert.equal(inherited, TOKEN);
  assert.equal(registryReads, 2);

  assert.equal(
    await resolveNexusToken({ environment: { DOORSTAR_NEXUS_ROOT_TOKEN: TOKEN }, platform: "linux" }),
    TOKEN
  );
  assert.equal(await resolveNexusToken({ environment: {}, platform: "linux" }), undefined);
});

test("maps every Codex principal to one fixed token variable and rejects unknown principals", async () => {
  assert.equal(tokenEnvironmentForPrincipal("doorstar-root-codex"), "DOORSTAR_NEXUS_ROOT_TOKEN");
  assert.equal(tokenEnvironmentForPrincipal("doorstar-conductor-codex"), "DOORSTAR_NEXUS_CONDUCTOR_TOKEN");
  assert.equal(tokenEnvironmentForPrincipal("doorstar-monitor-codex"), "DOORSTAR_NEXUS_MONITOR_TOKEN");
  assert.equal(tokenEnvironmentForPrincipal("doorstar-backend-codex"), "DOORSTAR_NEXUS_BACKEND_TOKEN");
  assert.equal(tokenEnvironmentForPrincipal("doorstar-frontend-codex"), "DOORSTAR_NEXUS_FRONTEND_TOKEN");
  assert.equal(
    tokenEnvironmentForPrincipal("doorstar-import-discovery-codex"),
    "DOORSTAR_NEXUS_IMPORT_DISCOVERY_TOKEN"
  );
  assert.equal(tokenEnvironmentForPrincipal("DOORSTAR_NEXUS_ROOT_TOKEN"), undefined);
  assert.equal(tokenEnvironmentForPrincipal("doorstar-codex"), undefined);

  const environment = {
    DOORSTAR_NEXUS_PRINCIPAL: "doorstar-frontend-codex",
    DOORSTAR_NEXUS_ROOT_TOKEN: TOKEN,
    DOORSTAR_NEXUS_FRONTEND_TOKEN: "b".repeat(64),
  };
  assert.equal(await resolveNexusToken({ environment, platform: "linux" }), "b".repeat(64));

  // Missing or malformed role credentials fail closed: another role's
  // credential must not collapse separate audit identities.
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
  assert.equal(
    parseWindowsUserEnvironmentToken(`    DOORSTAR_NEXUS_ROOT_TOKEN    REG_SZ    ${TOKEN}\r\n`),
    TOKEN
  );
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
    parseWindowsUserEnvironmentToken(
      `DOORSTAR_NEXUS_ROOT_TOKEN REG_SZ ${TOKEN}\r\n`,
      "DOORSTAR_NEXUS_FRONTEND_TOKEN"
    ),
    undefined
  );
});

test("standard MCP transport exposes exactly one read-only knowledge tool", async () => {
  const nexusClient = new NexusKnowledgeClient({
    token: TOKEN,
    fetchImplementation: async () => successResponse(),
  });
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
      openWorldHint: true,
    });

    const called = await client.callTool({
      name: "search_knowledge",
      arguments: { query: "ajtótok falvastagság", limit: 2 },
    });
    assert.equal(called.isError, undefined);
    assert.equal(called.content[0]?.type, "text");
    if (called.content[0]?.type !== "text") throw new Error("Expected text content.");
    assert.equal(JSON.parse(called.content[0].text).island, "doorstar");
  } finally {
    await client.close();
    await server.close();
  }
});
