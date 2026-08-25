import express from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";
import { logger } from "./logger.js";
import {
  serializeSafeError,
  serializeSafeHttpRequest,
  serializeSafeHttpResponse,
} from "./observability/httpLogSerializers.js";
import { boardRouter } from "./routes/board.js";
import { tasksRouter } from "./routes/tasks.js";
import { kanbanRouter } from "./routes/kanban.js";
import { loadRouter } from "./routes/load.js";
import { projectsRouter } from "./routes/projects.js";
import { templatesRouter } from "./routes/templates.js";
import { overviewRouter } from "./routes/overview.js";
import { productionOrdersRouter } from "./routes/productionOrders.js";
import { importRunsRouter } from "./routes/importRuns.js";
import { orderPositionEvidenceRouter } from "./routes/orderPositionEvidence.js";
import { manufacturedItemsRouter } from "./routes/manufacturedItems.js";
import { technicalCatalogRouter } from "./routes/technicalCatalog.js";
import { supplementaryItemsRouter } from "./routes/supplementaryItems.js";
import { componentSnapshotsRouter } from "./routes/componentSnapshots.js";
import { operationPlanSnapshotsRouter } from "./routes/operationPlanSnapshots.js";
import { readinessRouter } from "./routes/readiness.js";
import { productionServiceOpenApi } from "./openapi.js";
import { prisma } from "./db/client.js";
import { isServiceReady } from "./services/readiness.js";
import {
  legacyProductionRouteGroup,
  operationalRouteDefinitions,
  type LegacyProductionRouteSourceFile,
} from "./httpRouteTopology.js";

export interface ProductionServiceDependencies {
  /** Test seam for the operational readiness probe; production uses Prisma. */
  runDatabaseProbe?: () => Promise<unknown>;
  /** Test seam for capturing the already-redacted HTTP request lifecycle log. */
  httpLogger?: Logger;
}

export function createApp(dependencies: ProductionServiceDependencies = {}) {
  const app = express();

  // Same app is reachable at more than one public domain (nginx proxies
  // /api under whichever one the browser is on, so most requests are
  // same-origin anyway) — CORS_ORIGIN accepts a comma-separated list.
  const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:4611").split(",").map((o) => o.trim());
  app.use(cors({ origin: allowedOrigins.length > 1 ? allowedOrigins : allowedOrigins[0] }));
  // Task photo attachments are compressed JPEG data URIs, comfortably over
  // the default 100kb body limit.
  app.use(express.json({ limit: "3mb" }));
  app.use(pinoHttp({
    logger: dependencies.httpLogger ?? logger,
    // pino-http currently defaults this to true; make the safety boundary
    // explicit so serializer wrapping cannot silently drift with an upgrade.
    wrapSerializers: true,
    serializers: {
      req: serializeSafeHttpRequest,
      res: serializeSafeHttpResponse,
      err: serializeSafeError,
    },
  }));

  app.get(operationalRouteDefinitions.health.pathTemplate, (_req, res) => res.json({ status: "ok" }));
  app.get(operationalRouteDefinitions.readiness.pathTemplate, async (req, res) => {
    const ready = await isServiceReady(dependencies.runDatabaseProbe ?? (() => prisma.$queryRaw`SELECT 1`));
    if (!ready) {
      req.log?.error("readiness probe failed");
      res.status(503).json({ status: "not_ready" });
      return;
    }
    res.json({ status: "ready" });
  });
  app.get(operationalRouteDefinitions.openApi.pathTemplate, (_req, res) => res.type("application/json").send(productionServiceOpenApi));

  const api = express.Router();
  const legacyProductionRouters: Readonly<Record<LegacyProductionRouteSourceFile, express.Router>> = {
    "board.ts": boardRouter,
    "tasks.ts": tasksRouter,
    "kanban.ts": kanbanRouter,
    "load.ts": loadRouter,
    "projects.ts": projectsRouter,
    "templates.ts": templatesRouter,
    "overview.ts": overviewRouter,
    "productionOrders.ts": productionOrdersRouter,
    "orderPositionEvidence.ts": orderPositionEvidenceRouter,
    "manufacturedItems.ts": manufacturedItemsRouter,
    "supplementaryItems.ts": supplementaryItemsRouter,
    "componentSnapshots.ts": componentSnapshotsRouter,
    "operationPlanSnapshots.ts": operationPlanSnapshotsRouter,
    "readiness.ts": readinessRouter,
    "technicalCatalog.ts": technicalCatalogRouter,
    "importRuns.ts": importRunsRouter,
  };
  for (const sourceFile of legacyProductionRouteGroup.sourceFiles) {
    api.use(legacyProductionRouters[sourceFile]);
  }
  app.use(legacyProductionRouteGroup.mountPath, api);

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    req.log?.error({ err, event: "unhandled_request_error" });
    if (res.headersSent) return;
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
