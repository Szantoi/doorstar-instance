import express from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { logger } from "./logger.js";
import { boardRouter } from "./routes/board.js";
import { tasksRouter } from "./routes/tasks.js";
import { kanbanRouter } from "./routes/kanban.js";
import { loadRouter } from "./routes/load.js";
import { projectsRouter } from "./routes/projects.js";
import { templatesRouter } from "./routes/templates.js";
import { overviewRouter } from "./routes/overview.js";
import { productionServiceOpenApi } from "./openapi.js";
import { prisma } from "./db/client.js";
import { isServiceReady } from "./services/readiness.js";

export interface ProductionServiceDependencies {
  /** Test seam for the operational readiness probe; production uses Prisma. */
  runDatabaseProbe?: () => Promise<unknown>;
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
  app.use(pinoHttp({ logger }));

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.get("/readyz", async (req, res) => {
    const ready = await isServiceReady(dependencies.runDatabaseProbe ?? (() => prisma.$queryRaw`SELECT 1`));
    if (!ready) {
      req.log?.error("readiness probe failed");
      res.status(503).json({ status: "not_ready" });
      return;
    }
    res.json({ status: "ready" });
  });
  app.get("/openapi.json", (_req, res) => res.type("application/json").send(productionServiceOpenApi));

  const api = express.Router();
  api.use(boardRouter);
  api.use(tasksRouter);
  api.use(kanbanRouter);
  api.use(loadRouter);
  api.use(projectsRouter);
  api.use(templatesRouter);
  api.use(overviewRouter);
  app.use("/api/production", api);

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    req.log?.error({ err }, "unhandled request error");
    if (res.headersSent) return;
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
