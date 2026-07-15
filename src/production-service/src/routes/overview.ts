import { Router } from "express";
import { prisma } from "../db/client.js";
import { STATIONS } from "../config/stations.js";

export const overviewRouter = Router();

overviewRouter.get("/stations", (_req, res) => {
  res.json({ stations: STATIONS });
});

/**
 * GET /api/production/overview — aggregate counts shaped like the .NET
 * Production module's ProductionOverviewDto (ActiveJobs/CompletedJobs/
 * OverdueJobs/ShippingReadyJobs), computed from Project.status here.
 * Kept schema-compatible so a future dashboard can read from either module.
 */
overviewRouter.get("/overview", async (_req, res) => {
  const [activeJobs, shippingReadyJobs, allProjects] = await Promise.all([
    prisma.project.count({ where: { status: "IN_PROGRESS" } }),
    prisma.project.count({ where: { status: "SHIPPING_READY" } }),
    prisma.project.findMany({ include: { tasks: true } }),
  ]);

  const today = new Date();
  const overdueJobs = allProjects.filter((p) =>
    p.tasks.some((t) => t.dueDate && new Date(t.dueDate) < today && t.problem)
  ).length;
  const completedJobs = allProjects.filter((p) => p.status === "SHIPPING_READY").length;

  res.json({
    activeJobs,
    completedJobs,
    overdueJobs,
    shippingReadyJobs,
  });
});
