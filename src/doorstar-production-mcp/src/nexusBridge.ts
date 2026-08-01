import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { NexusKnowledgeClient, NexusKnowledgeError, resolveNexusToken } from "./nexusKnowledge.js";

const KNOWLEDGE_QUERY = z.string().trim().min(2).max(500);
const RESULT_LIMIT = z.number().int().min(1).max(10).optional().default(5);
const MAX_RESULT_BYTES = 512 * 1024;

function safeResult(data: unknown) {
  const text = JSON.stringify(data);
  if (Buffer.byteLength(text, "utf8") > MAX_RESULT_BYTES) {
    return {
      content: [{ type: "text" as const, text: "A Doorstar tudástári válasz túl nagy; kérj szűkebb keresést." }],
      isError: true,
    };
  }
  return { content: [{ type: "text" as const, text }] };
}

function safeError(error: unknown) {
  if (error instanceof NexusKnowledgeError) {
    if (error.kind === "unauthorized") {
      return {
        content: [{ type: "text" as const, text: "A Doorstar Nexus-hozzáférés hitelesítése sikertelen. A hozzáférést újra kell kötni." }],
        isError: true,
      };
    }
    if (error.kind === "unavailable") {
      return {
        content: [{ type: "text" as const, text: "A Doorstar Nexus tudástár jelenleg nem érhető el." }],
        isError: true,
      };
    }
    if (error.kind === "invalid_response") {
      return {
        content: [{ type: "text" as const, text: "A Doorstar Nexus tudástár válaszát biztonsági okból elutasítottam." }],
        isError: true,
      };
    }
  }
  return {
    content: [{ type: "text" as const, text: "A Doorstar tudástári keresés sikertelen volt." }],
    isError: true,
  };
}

export function createNexusKnowledgeServer(client: NexusKnowledgeClient) {
  const server = new McpServer(
    { name: "doorstar-nexus-knowledge", version: "0.1.0" },
    {
      instructions:
        "Csak olvasható Doorstar faipari RAG. A szigetet és a gyűjteményt a Nexus a hitelesített klienshez rendeli; az agent ezeket nem választhatja meg.",
    }
  );

  server.registerTool(
    "search_knowledge",
    {
      title: "Doorstar faipari tudástár keresése",
      description:
        "Szemantikus keresés a Nexus által a Doorstar szigethez rendelt faipari tudásanyagban. Forrást, oldalt és hasonlósági pontszámot ad vissza, ha ezek elérhetők.",
      inputSchema: {
        query: KNOWLEDGE_QUERY.describe("Faipari kérdés vagy keresőkifejezés."),
        limit: RESULT_LIMIT.describe("Találatok száma 1 és 10 között; alapérték 5."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, limit }) => {
      try {
        return safeResult(await client.search(query, limit));
      } catch (error) {
        return safeError(error);
      }
    }
  );

  return server;
}

async function main() {
  const client = new NexusKnowledgeClient({ token: await resolveNexusToken() });
  const server = createNexusKnowledgeServer(client);
  await server.connect(new StdioServerTransport());
  // stdout is reserved for MCP JSON-RPC frames. Never print credentials or
  // upstream response bodies to stderr either.
  console.error("Doorstar Nexus Knowledge MCP connected (read-only stdio bridge).");
}

const isMainModule = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  main().catch(() => {
    console.error("Doorstar Nexus Knowledge MCP could not start.");
    process.exitCode = 1;
  });
}
