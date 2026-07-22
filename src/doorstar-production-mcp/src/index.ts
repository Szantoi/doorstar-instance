import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { ProductionApi, ProductionApiError, currentMonday } from "./api.js";
import { loadKnowledgeCorpus, searchKnowledge } from "./knowledge.js";

const WEEK = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD formátum szükséges.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === Number(value.slice(0, 4)) &&
      date.getMonth() + 1 === Number(value.slice(5, 7)) &&
      date.getDate() === Number(value.slice(8, 10)) &&
      date.getDay() === 1
    );
  }, "Érvényes hétfői dátum szükséges.");
const IDENTIFIER = z.string().trim().min(1).max(200);
const KNOWLEDGE_QUERY = z.string().trim().min(2).max(500);
const RESULT_LIMIT = z.number().int().min(1).max(10).optional().default(5);
const MAX_RESULT_BYTES = 512_000;
// Do not make the corpus root configurable: this adapter must never become a
// generic clean-repository reader through an environment-variable override.
const repositoryRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

const server = new McpServer(
  { name: "doorstar-production", version: "0.1.0" },
  {
    instructions:
      "Doorstar termelési adatok csak olvasásra. Ez az adapter nem módosít adatot; írási igényhez emberi jóváhagyásos, külön MCP-képesség szükséges.",
  }
);
const api = new ProductionApi();

function jsonResult(data: unknown) {
  const text = JSON.stringify(data);
  if (Buffer.byteLength(text, "utf8") > MAX_RESULT_BYTES) {
    return {
      content: [{ type: "text" as const, text: "A válasz túl nagy az MCP-adapter biztonságos korlátjához. Kérj szűkebb lekérdezést (például egy konkrét feladatot vagy projektet)." }],
      isError: true,
    };
  }
  return { content: [{ type: "text" as const, text }] };
}

async function readResult(request: () => Promise<unknown>) {
  try {
    return jsonResult(await request());
  } catch (error) {
    if (error instanceof ProductionApiError && error.kind === "not_found") {
      return { content: [{ type: "text" as const, text: "A kért Doorstar-adat nem található." }], isError: true };
    }
    if (error instanceof ProductionApiError && error.kind === "unavailable") {
      return {
        content: [{ type: "text" as const, text: "A Doorstar Production Service most nem érhető el. Ellenőrizd, hogy helyben fut-e a 4610-as porton." }],
        isError: true,
      };
    }
    return { content: [{ type: "text" as const, text: "A Doorstar-adat lekérése sikertelen volt." }], isError: true };
  }
}

server.registerTool(
  "get_overview",
  {
    title: "Doorstar áttekintés",
    description: "Az adott hét táblája és az aktív projektek egyetlen, csak olvasható áttekintésben.",
    inputSchema: { week: WEEK.optional().describe("Hétfő dátuma YYYY-MM-DD; alapértelmezésben a jelenlegi hét.") },
    annotations: { readOnlyHint: true },
  },
  ({ week }) => readResult(() => api.getOverview(week ?? currentMonday()))
);

server.registerTool(
  "list_projects",
  {
    title: "Aktív Doorstar projektek",
    description: "Az aktív, nem archivált projektek és haladási összesítőjük.",
    annotations: { readOnlyHint: true },
  },
  () => readResult(() => api.getProjects())
);

server.registerTool(
  "get_project",
  {
    title: "Doorstar projekt munkalap",
    description: "Egy aktív projekt teljes munkalapja epikekkel, lépésekkel és részlapokkal.",
    inputSchema: { key: IDENTIFIER.describe("Projekt technikai kulcsa.") },
    annotations: { readOnlyHint: true },
  },
  ({ key }) => readResult(() => api.getProject(key))
);

server.registerTool(
  "get_board",
  {
    title: "Doorstar heti tábla",
    description: "Egy hét összes termelési feladata, állomása és oldalsáv-állapota.",
    inputSchema: { week: WEEK.describe("Hétfő dátuma YYYY-MM-DD.") },
    annotations: { readOnlyHint: true },
  },
  ({ week }) => readResult(() => api.getBoard(week))
);

server.registerTool(
  "get_kanban",
  {
    title: "Doorstar állomás Kanban",
    description: "Egy állomás Kanban-sávjai, a korábbi hetekről áthozott nyitott feladatokkal együtt.",
    inputSchema: {
      station: IDENTIFIER.describe("Állomás neve, például CNC."),
      week: WEEK.describe("Hétfő dátuma YYYY-MM-DD."),
    },
    annotations: { readOnlyHint: true },
  },
  ({ station, week }) => readResult(() => api.getKanban(station, week))
);

server.registerTool(
  "get_load",
  {
    title: "Doorstar kapacitásterhelés",
    description: "Az adott hét állomás és nap szerinti kapacitásterhelése.",
    inputSchema: { week: WEEK.describe("Hétfő dátuma YYYY-MM-DD.") },
    annotations: { readOnlyHint: true },
  },
  ({ week }) => readResult(() => api.getLoad(week))
);

server.registerTool(
  "get_task",
  {
    title: "Doorstar feladat részletei",
    description: "Egy konkrét termelési feladat részletei, állapota és naplója.",
    inputSchema: { id: IDENTIFIER.describe("Feladat azonosítója.") },
    annotations: { readOnlyHint: true },
  },
  ({ id }) => readResult(() => api.getTask(id))
);

server.registerTool(
  "search_knowledge",
  {
    title: "Doorstar projekt-tudástár keresése",
    description: "A kurált Doorstar dokumentációból keres bizonyítható forrással és rövid kivonattal. Nem keres konfigurációban, titokban vagy nem commitolt anyagban.",
    inputSchema: {
      query: KNOWLEDGE_QUERY.describe("Keresési kérdés vagy kulcsszavak."),
      limit: RESULT_LIMIT.describe("Visszaadott találatok száma, 1 és 10 között; alapérték 5."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ query, limit }) =>
    readResult(async () => {
      const corpus = await loadKnowledgeCorpus(repositoryRoot);
      const results = searchKnowledge(corpus, query, limit);
      return { query, corpusVersion: corpus.corpusVersion, count: results.length, results };
    })
);

server.registerTool(
  "corpus_status",
  {
    title: "Doorstar tudástár állapota",
    description: "A kurált, csak olvasható Doorstar RAG-korpusz állapota és forrásjegyzéke.",
    annotations: { readOnlyHint: true },
  },
  async () =>
    readResult(async () => {
      const corpus = await loadKnowledgeCorpus(repositoryRoot);
      return {
        corpusVersion: corpus.corpusVersion,
        indexedAt: corpus.indexedAt,
        documents: corpus.documentCount,
        chunks: corpus.chunkCount,
        sourcesIncluded: corpus.sources.map((source) => ({ path: source.path, kind: source.kind, sha256: source.sha256 })),
        exclusions: corpus.exclusions,
      };
    })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for JSON-RPC; diagnostics must never be printed there.
  console.error("Doorstar Production MCP connected (read-only stdio mode).");
}

main().catch(() => {
  console.error("Doorstar Production MCP could not start.");
  process.exitCode = 1;
});
