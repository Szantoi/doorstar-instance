import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { monday } from "../src/domain/dates.js";

const app = createApp();
const week = monday(new Date());
const previousWeek = new Date(`${week}T00:00:00`);
previousWeek.setDate(previousWeek.getDate() - 7);
const previousWeekKey = previousWeek.toISOString().slice(0, 10);
const nextWeek = new Date(`${week}T00:00:00`);
nextWeek.setDate(nextWeek.getDate() + 7);
const nextWeekKey = nextWeek.toISOString().slice(0, 10);

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.taskAuditEntry.deleteMany();
  await prisma.task.deleteMany();
  await prisma.orderChecklistItem.deleteMany();
  await prisma.weekNote.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("board API", () => {
  it("blocks a pool task before any board row is created", async () => {
    const blocked = await request(app)
      .post("/api/production/tasks")
      .send({ title: "Guarded board task", week, day: 2 })
      .expect(409);
    expect(blocked.body).toMatchObject({
      error: "legacy_production_issue_blocked",
      details: { mutation: "create_task", projectId: null },
    });
    expect((await request(app).get(`/api/production/board?week=${week}`).expect(200)).body.tasks).toEqual([]);
  });

  it("marks a task done once it reaches the last workflow step", async () => {
    const created = await prisma.task.create({
      data: { title: "Existing CNC task", station: "CNC", week, day: 0 },
    });

    const patched = await request(app)
      .patch(`/api/production/tasks/${created.id}`)
      .send({ stepIndex: 2 })
      .expect(200);

    expect(patched.body.stepIndex).toBe(2);

    const board = await request(app).get(`/api/production/board?week=${week}`).expect(200);
    const found = board.body.tasks.find((t: { id: string }) => t.id === created.id);
    expect(found.isDone).toBe(true);
    expect(found.status).toBe("done");
  });

  it("rejects an invalid task payload", async () => {
    await request(app).post("/api/production/tasks").send({ title: "" }).expect(400);
  });

  it("blocks creating a manually added board task for an existing project", async () => {
    const project = await prisma.project.create({ data: { key: `TEST-PROJECT-${Date.now()}`, name: "Guard project", num: "251" } });

    const blocked = await request(app)
      .post("/api/production/tasks")
      .send({ title: "Guarded project task", projectKey: project.key, station: "CNC", week, day: 1 })
      .expect(409);

    expect(blocked.body.details).toMatchObject({ mutation: "create_task", projectId: project.id });
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(0);
    await prisma.project.delete({ where: { id: project.id } });
  });

  it("blocks laundering a free task into project or epic production work", async () => {
    const suffix = Date.now();
    const [firstProject, secondProject] = await Promise.all([
      prisma.project.create({ data: { key: `TEST-DETAIL-A-${suffix}`, name: "Első projekt" } }),
      prisma.project.create({ data: { key: `TEST-DETAIL-B-${suffix}`, name: "Második projekt" } }),
    ]);
    const secondEpic = await prisma.epic.create({ data: { projectId: secondProject.id, name: "Ajtólap" } });
    const skippedEpic = await prisma.epic.create({ data: { projectId: secondProject.id, name: "Kihagyott", disabled: true } });
    const created = await prisma.task.create({
      data: { title: "Existing free task", station: "CNC", week, day: 1 },
    });

    const moved = await request(app)
      .patch(`/api/production/tasks/${created.id}`)
      .send({ projectKey: secondProject.key })
      .expect(409);
    expect(moved.body.details).toMatchObject({ mutation: "attach_task_to_project", projectId: secondProject.id });

    await request(app)
      .patch(`/api/production/tasks/${created.id}`)
      .send({ epicId: skippedEpic.id })
      .expect(404);

    const linked = await request(app)
      .patch(`/api/production/tasks/${created.id}`)
      .send({ epicId: secondEpic.id, quantity: 20, unitHours: 0.25 })
      .expect(409);
    expect(linked.body.details).toMatchObject({ mutation: "attach_task_to_project", projectId: secondProject.id });

    await request(app)
      .patch(`/api/production/tasks/${created.id}`)
      .set("X-Role", "allomas")
      .set("X-Station", "CNC")
      .send({ quantity: 99 })
      .expect(403);

    await request(app)
      .patch(`/api/production/tasks/${created.id}`)
      .set("X-Role", "allomas")
      .send({ projectKey: secondProject.key })
      .expect(403);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      projectId: null,
      epicId: null,
    });

    await prisma.task.delete({ where: { id: created.id } });
    await prisma.project.deleteMany({ where: { id: { in: [firstProject.id, secondProject.id] } } });
  });

  it("keeps an issued work-sheet task linked to its source project", async () => {
    const suffix = Date.now();
    const [sourceProject, otherProject] = await Promise.all([
      prisma.project.create({ data: { key: `TEST-ISSUED-A-${suffix}`, name: "Forrás projekt" } }),
      prisma.project.create({ data: { key: `TEST-ISSUED-B-${suffix}`, name: "Másik projekt" } }),
    ]);
    const epic = await prisma.epic.create({ data: { projectId: sourceProject.id, name: "Tok" } });
    const epicStep = await prisma.epicStep.create({ data: { epicId: epic.id, name: "CNC" } });
    const issuedTask = await prisma.task.create({
      data: { projectId: sourceProject.id, epicStepId: epicStep.id, title: "Munkamenetből kiadva", week, day: 1 },
    });

    await request(app)
      .patch(`/api/production/tasks/${issuedTask.id}`)
      .send({ projectKey: otherProject.key })
      .expect(409);
    await request(app)
      .patch(`/api/production/tasks/${issuedTask.id}`)
      .send({ projectKey: null })
      .expect(409);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: issuedTask.id } })).projectId).toBe(sourceProject.id);

    await prisma.task.delete({ where: { id: issuedTask.id } });
    await prisma.project.deleteMany({ where: { id: { in: [sourceProject.id, otherProject.id] } } });
  });

  it("rejects a manually added task with an unknown project key", async () => {
    await request(app)
      .post("/api/production/tasks")
      .send({ title: "Árva projektfeladat", projectKey: "NINCS-ILYEN", station: "CNC", week, day: 1 })
      .expect(404);
  });

  it("requires a manager role to add a task to the board", async () => {
    await request(app)
      .post("/api/production/tasks")
      .set("X-Role", "allomas")
      .send({ title: "Állomás nem írhat fel új feladatot", station: "CNC", week, day: 1 })
      .expect(403);
  });

  it("edits project identity, saves epic removal, and archives without losing issued tasks", async () => {
    const project = await prisma.project.create({ data: { key: `TEST-CRUD-${Date.now()}`, name: "Eredeti projekt", num: "100" } });
    const task = await prisma.task.create({
      data: { title: "Megmaradó előzmény", projectId: project.id, week, day: 1 },
    });

    const edited = await request(app)
      .put(`/api/production/projects/${project.key}`)
      .send({ name: "Módosított projekt", num: "101" })
      .expect(200);
    expect(edited.body.name).toBe("Módosított projekt");
    expect(edited.body.num).toBe("101");

    const savedEpics = await request(app)
      .put(`/api/production/projects/${project.key}/epics`)
      .send({
        epics: [
          { name: "Törlendő epik", steps: [{ name: "Első lépés", planDate: "2026-07-20" }] },
          { name: "Megmaradó epik", steps: [{ name: "Második lépés", planDate: "2026-07-21" }] },
        ],
      })
      .expect(200);

    const issuedFromDeletedEpic = await prisma.task.create({
      data: {
        projectId: project.id,
        epicId: savedEpics.body[0].id,
        epicStepId: savedEpics.body[0].steps[0].id,
        epicName: "Törlendő epik",
        title: "Legacy fixture one",
        week,
        day: 1,
      },
    });
    const issuedFromRemainingEpic = await prisma.task.create({
      data: {
        projectId: project.id,
        epicId: savedEpics.body[1].id,
        epicStepId: savedEpics.body[1].steps[0].id,
        epicName: "Megmaradó epik",
        title: "Legacy fixture two",
        week,
        day: 1,
      },
    });

    await request(app)
      .delete(`/api/production/projects/${project.key}/epics/${savedEpics.body[0].id}`)
      .expect(204);
    const remainingEpics = await request(app).get(`/api/production/projects/${project.key}`).expect(200);
    expect(remainingEpics.body.epics).toHaveLength(1);
    expect(remainingEpics.body.epics[0].name).toBe("Megmaradó epik");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: issuedFromDeletedEpic.id } })).epicStepId).toBeNull();

    await request(app)
      .put(`/api/production/projects/${project.key}/epics`)
      .send({ epics: [{ ...remainingEpics.body.epics[0], name: "Megmaradó epik módosítva" }] })
      .expect(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: issuedFromRemainingEpic.id } })).epicStepId).toBe(
      issuedFromRemainingEpic.epicStepId
    );

    await request(app).delete(`/api/production/projects/${project.key}`).expect(204);
    await request(app).get(`/api/production/projects/${project.key}`).expect(404);
    const cards = await request(app).get("/api/production/projects").expect(200);
    expect(cards.body.some((card: { key: string }) => card.key === project.key)).toBe(false);
    await request(app)
      .post("/api/production/tasks")
      .send({ title: "Archivált projekthez új", projectKey: project.key, week, day: 1 })
      .expect(404);

    const archived = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(archived.deletedAt).toBeTruthy();
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeTruthy();

    await prisma.task.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
  });

  it("does not let an operator edit or archive a project", async () => {
    const project = await prisma.project.create({ data: { key: `TEST-ROLE-${Date.now()}`, name: "Védett projekt" } });

    await request(app)
      .put(`/api/production/projects/${project.key}`)
      .set("X-Role", "allomas")
      .send({ name: "Illetéktelen módosítás" })
      .expect(403);
    await request(app)
      .delete(`/api/production/projects/${project.key}`)
      .set("X-Role", "allomas")
      .expect(403);

    await prisma.project.delete({ where: { id: project.id } });
  });

  it("rejects publishing an entire session until every unissued step has a planned day", async () => {
    const project = await prisma.project.create({ data: { key: `TEST-PLAN-DATE-${Date.now()}`, name: "Tervezett nap teszt" } });
    const epic = await prisma.epic.create({ data: { projectId: project.id, name: "Ajtólap" } });
    const datedStep = await prisma.epicStep.create({
      data: { epicId: epic.id, name: "CNC", station: "CNC", planDate: new Date("2026-07-20") },
    });
    const undatedStep = await prisma.epicStep.create({ data: { epicId: epic.id, name: "Fóliázás", station: "FÓLIA" } });

    const rejected = await request(app).post(`/api/production/projects/${project.key}/schedule`).send({}).expect(409);
    expect(rejected.body).toMatchObject({ error: "missing_plan_dates" });
    expect(rejected.body.missingSteps).toContainEqual(
      expect.objectContaining({ epicId: epic.id, stepId: undatedStep.id, stepName: "Fóliázás" })
    );
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(0);

    await prisma.epicStep.update({ where: { id: undatedStep.id }, data: { planDate: new Date("2026-07-21") } });
    const blocked = await request(app).post(`/api/production/projects/${project.key}/schedule`).send({}).expect(409);
    expect(blocked.body).toMatchObject({
      error: "legacy_production_issue_blocked",
      details: { mutation: "issue_project_session", projectId: project.id },
    });

    const tasks = await prisma.task.findMany({ where: { projectId: project.id }, orderBy: { title: "asc" } });
    expect(tasks).toHaveLength(0);

    await prisma.task.create({
      data: { projectId: project.id, epicId: epic.id, epicStepId: datedStep.id, epicName: epic.name, title: "Existing dated step", week, day: 0 },
    });
    await request(app).post(`/api/production/projects/${project.key}/schedule`).send({}).expect(409);
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(1);
    await prisma.task.create({
      data: { projectId: project.id, epicId: epic.id, epicStepId: undatedStep.id, epicName: epic.name, title: "Existing second step", week, day: 1 },
    });
    const noOp = await request(app).post(`/api/production/projects/${project.key}/schedule`).send({}).expect(200);
    expect(noOp.body).toMatchObject({ createdCount: 0, skippedExisting: 2, missingPlanDates: [] });

    await prisma.task.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
  });

  it("groups every station task by status in Kanban regardless of its week", async () => {
    const [openTask, completedTask, assignedTask, poolTask, futureTask] = await Promise.all([
      prisma.task.create({ data: { title: "Régi, nyitott CNC feladat", station: "CNC", week: previousWeekKey, day: 4 } }),
      prisma.task.create({ data: { title: "Régi, kész CNC feladat", station: "CNC", week: previousWeekKey, day: 4 } }),
      prisma.task.create({ data: { title: "Régi, még fel nem vett CNC feladat", station: "CNC", week: previousWeekKey, day: 4 } }),
      prisma.task.create({ data: { title: "Régi, szabad feladat", week: previousWeekKey, day: 4 } }),
      prisma.task.create({ data: { title: "Jövő heti, folyamatban lévő CNC feladat", station: "CNC", week: nextWeekKey, day: 1 } }),
    ]);

    await request(app).patch(`/api/production/tasks/${openTask.id}`).send({ acknowledged: true, stepIndex: 1 }).expect(200);
    await request(app).patch(`/api/production/tasks/${completedTask.id}`).send({ acknowledged: true, stepIndex: 2 }).expect(200);
    await request(app).patch(`/api/production/tasks/${futureTask.id}`).send({ acknowledged: true, stepIndex: 1 }).expect(200);

    const kanban = await request(app).get(`/api/production/kanban?station=CNC&week=${week}`).expect(200);
    const visibleIds = kanban.body.columns.flatMap((column: { tasks: Array<{ id: string }> }) => column.tasks.map((task) => task.id));

    expect(visibleIds).toContain(openTask.id);
    expect(visibleIds).toContain(completedTask.id);
    expect(visibleIds).toContain(futureTask.id);
    expect(kanban.body.assigned.map((task: { id: string }) => task.id)).toContain(assignedTask.id);
    expect(kanban.body.pool.map((task: { id: string }) => task.id)).toContain(poolTask.id);
    expect(kanban.body).not.toHaveProperty("carriedOverCount");
  });

  it("keeps predecessor and idempotent no-op semantics while blocking every new step Task", async () => {
    const suffix = `single-step-${Date.now()}`;
    const project = await prisma.project.create({ data: { key: suffix, name: "Egyedi kiadás teszt" } });
    const epic = await prisma.epic.create({ data: { projectId: project.id, name: "Tok" } });
    const [firstStep, secondStep] = await Promise.all([
      prisma.epicStep.create({ data: { epicId: epic.id, name: "Szabás", station: "CNC", planDate: new Date("2026-08-03") } }),
      prisma.epicStep.create({ data: { epicId: epic.id, name: "Marás", station: "CNC", planDate: new Date("2026-08-04"), position: 1 } }),
    ]);

    const predecessorBlocked = await request(app)
      .post(`/api/production/projects/${project.key}/steps/${secondStep.id}/issue`)
      .expect(409);
    expect(predecessorBlocked.body.error).toBe("predecessor_not_issued");
    const firstBlocked = await request(app)
      .post(`/api/production/projects/${project.key}/steps/${firstStep.id}/issue`)
      .expect(409);
    expect(firstBlocked.body).toMatchObject({
      error: "legacy_production_issue_blocked",
      details: { mutation: "issue_project_step", projectId: project.id },
    });
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(0);

    const existingFirst = await prisma.task.create({
      data: {
        projectId: project.id,
        epicId: epic.id,
        epicStepId: firstStep.id,
        epicName: epic.name,
        title: "Existing issued first step",
        week,
        day: 0,
      },
    });
    const noOp = await request(app)
      .post(`/api/production/projects/${project.key}/steps/${firstStep.id}/issue`)
      .expect(200);
    expect(noOp.body).toEqual({ outcome: "already_issued", taskId: existingFirst.id });
    await request(app).post(`/api/production/projects/${project.key}/steps/${secondStep.id}/issue`).expect(409);
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(1);
    await request(app).delete(`/api/production/projects/${project.key}/steps/${firstStep.id}/issue`).expect(204);

    const freeTask = await prisma.task.create({ data: { projectId: project.id, title: "Epik nélküli", week, day: 2 } });
    const detail = await request(app).get(`/api/production/projects/${project.key}`).expect(200);
    expect(detail.body.unepicTasks.map((task: { id: string }) => task.id)).toContain(freeTask.id);

    await prisma.task.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
  });
});
