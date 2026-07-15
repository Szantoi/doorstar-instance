import { Router } from "express";
import { prisma } from "../db/client.js";
import { computeLoad } from "../services/capacity.js";
import { validateBody } from "../middleware/validate.js";
import { capacitySchema } from "../domain/schemas.js";
import { monday } from "../domain/dates.js";

export const loadRouter = Router();

/** GET /api/production/load?week=... — department × day capacity heatmap for the week. */
loadRouter.get("/load", async (req, res) => {
  const week = typeof req.query.week === "string" ? req.query.week : monday(new Date());
  const report = await computeLoad(week);
  res.json(report);
});

/** PUT /api/production/capacity — update the global hours/day/station assumption. */
loadRouter.put("/capacity", validateBody(capacitySchema), async (req, res) => {
  const { hoursPerDay } = req.body as { hoursPerDay: number };
  const setting = await prisma.capacitySetting.upsert({
    where: { id: "default" },
    create: { id: "default", hoursPerDay },
    update: { hoursPerDay },
  });
  res.json(setting);
});
