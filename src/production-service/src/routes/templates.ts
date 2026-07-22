import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { validateBody } from "../middleware/validate.js";
import { sheetTemplateSchema, epikTemplateSchema } from "../domain/schemas.js";
import { findActiveProject } from "../services/projects.js";
import { requireManager } from "../middleware/requester.js";

/** Zod already validated req.body into a plain JSON-safe structure; Prisma's
 * recursive Json input type just needs the cast spelled out once here. */
function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export const templatesRouter = Router();

templatesRouter.get("/templates", async (_req, res) => {
  res.json(await prisma.sheetTemplate.findMany({ orderBy: { name: "asc" } }));
});

templatesRouter.post("/templates", validateBody(sheetTemplateSchema), async (req, res) => {
  if (!requireManager(req, res)) return;
  const { name, epics } = req.body as { name: string; epics: unknown };
  const template = await prisma.sheetTemplate.upsert({
    where: { name },
    create: { name, epics: asJson(epics) },
    update: { epics: asJson(epics) },
  });
  res.status(201).json(template);
});

/** POST /api/production/templates/:name/apply/:key — "Betölt": replaces the
 * project's epic tree with the template's epics (same shape as PUT .../epics). */
templatesRouter.post("/templates/:name/apply/:key", async (req, res) => {
  if (!requireManager(req, res)) return;
  const template = await prisma.sheetTemplate.findUnique({ where: { name: req.params.name } });
  if (!template) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ epics: template.epics });
});

templatesRouter.get("/epik-templates", async (_req, res) => {
  res.json(await prisma.epikTemplate.findMany({ orderBy: { name: "asc" } }));
});

templatesRouter.post("/epik-templates", validateBody(epikTemplateSchema), async (req, res) => {
  if (!requireManager(req, res)) return;
  const { name, epic } = req.body as { name: string; epic: unknown };
  const template = await prisma.epikTemplate.upsert({
    where: { name },
    create: { name, epic: asJson(epic) },
    update: { epic: asJson(epic) },
  });
  res.status(201).json(template);
});

/** POST /api/production/epik-templates/:name/apply/:key — "+ Epik sablonból":
 * appends the template's single epic onto the project's epic list. */
templatesRouter.post("/epik-templates/:name/apply/:key", async (req, res) => {
  if (!requireManager(req, res)) return;
  const template = await prisma.epikTemplate.findUnique({ where: { name: req.params.name } });
  const project = await findActiveProject(req.params.key);
  if (!template || !project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const epicData = template.epic as {
    name: string;
    quantityLabel?: string | null;
    steps: Array<{ name: string; station?: string | null }>;
  };
  const position = await prisma.epic.count({ where: { projectId: project.id } });
  const epic = await prisma.epic.create({
    data: {
      projectId: project.id,
      name: epicData.name,
      quantityLabel: epicData.quantityLabel ?? null,
      position,
      steps: { create: epicData.steps.map((s, i) => ({ name: s.name, station: s.station ?? null, position: i })) },
    },
    include: { steps: true },
  });
  res.status(201).json(epic);
});
