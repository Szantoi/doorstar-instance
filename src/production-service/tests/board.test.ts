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
  it("creates a pool task and returns it in the board for that week", async () => {
    const created = await request(app)
      .post("/api/production/tasks")
      .send({ title: "Teszt feladat", week, day: 2 })
      .expect(201);

    expect(created.body.station).toBeNull();
    expect(created.body.week).toBe(week);

    const board = await request(app).get(`/api/production/board?week=${week}`).expect(200);
    const found = board.body.tasks.find((t: { id: string }) => t.id === created.body.id);
    expect(found).toBeTruthy();
    expect(found.status).toBe("assigned");
    expect(found.isDone).toBe(false);
  });

  it("marks a task done once it reaches the last workflow step", async () => {
    const created = await request(app)
      .post("/api/production/tasks")
      .send({ title: "CNC feladat", station: "CNC", week, day: 0 })
      .expect(201);

    const patched = await request(app)
      .patch(`/api/production/tasks/${created.body.id}`)
      .send({ stepIndex: 2 })
      .expect(200);

    expect(patched.body.stepIndex).toBe(2);

    const board = await request(app).get(`/api/production/board?week=${week}`).expect(200);
    const found = board.body.tasks.find((t: { id: string }) => t.id === created.body.id);
    expect(found.isDone).toBe(true);
    expect(found.status).toBe("done");
  });

  it("rejects an invalid task payload", async () => {
    await request(app).post("/api/production/tasks").send({ title: "" }).expect(400);
  });

  it("links a manually added board task to an existing project by project key", async () => {
    const project = await prisma.project.create({ data: { key: `TEST-PROJECT-${Date.now()}`, name: "Demó projekt", num: "251" } });

    const created = await request(app)
      .post("/api/production/tasks")
      .send({ title: "Kézzel felírt projektfeladat", projectKey: project.key, station: "CNC", week, day: 1 })
      .expect(201);

    expect(created.body.projectId).toBe(project.id);

    const board = await request(app).get(`/api/production/board?week=${week}`).expect(200);
    const found = board.body.tasks.find((task: { id: string }) => task.id === created.body.id);
    expect(found.projectNum).toBe("251");

    await prisma.task.delete({ where: { id: created.body.id } });
    await prisma.project.delete({ where: { id: project.id } });
  });

  it("lets a manager change or clear a free task's project from its detail sheet", async () => {
    const suffix = Date.now();
    const [firstProject, secondProject] = await Promise.all([
      prisma.project.create({ data: { key: `TEST-DETAIL-A-${suffix}`, name: "Első projekt" } }),
      prisma.project.create({ data: { key: `TEST-DETAIL-B-${suffix}`, name: "Második projekt" } }),
    ]);
    const secondEpic = await prisma.epic.create({ data: { projectId: secondProject.id, name: "Ajtólap" } });
    const skippedEpic = await prisma.epic.create({ data: { projectId: secondProject.id, name: "Kihagyott", disabled: true } });
    const created = await request(app)
      .post("/api/production/tasks")
      .send({ title: "Módosítható projektű feladat", projectKey: firstProject.key, station: "CNC", week, day: 1 })
      .expect(201);

    const moved = await request(app)
      .patch(`/api/production/tasks/${created.body.id}`)
      .send({ projectKey: secondProject.key })
      .expect(200);
    expect(moved.body.projectId).toBe(secondProject.id);

    const detail = await request(app).get(`/api/production/tasks/${created.body.id}`).expect(200);
    expect(detail.body.project).toMatchObject({ id: secondProject.id, key: secondProject.key, name: "Második projekt" });
    expect(detail.body.audit[0].label).toBe("Projekt hozzárendelés módosítva");

    await request(app)
      .patch(`/api/production/tasks/${created.body.id}`)
      .send({ epicId: skippedEpic.id })
      .expect(404);

    const linked = await request(app)
      .patch(`/api/production/tasks/${created.body.id}`)
      .send({ epicId: secondEpic.id, quantity: 20, unitHours: 0.25 })
      .expect(200);
    expect(linked.body).toMatchObject({ projectId: secondProject.id, epicId: secondEpic.id, epicName: "Ajtólap", quantity: 20, unitHours: 0.25 });
    const linkedDetail = await request(app).get(`/api/production/tasks/${created.body.id}`).expect(200);
    expect(linkedDetail.body.epic).toMatchObject({ id: secondEpic.id, name: "Ajtólap" });
    const load = await request(app).get(`/api/production/load?week=${week}`).expect(200);
    expect(load.body.stations.find((station: { station: string }) => station.station === "CNC").cells[1].hours).toBe(5);

    const movedWithEpicCleared = await request(app)
      .patch(`/api/production/tasks/${created.body.id}`)
      .send({ projectKey: firstProject.key, epicId: null })
      .expect(200);
    expect(movedWithEpicCleared.body).toMatchObject({ projectId: firstProject.id, epicId: null, epicName: null });

    await request(app)
      .patch(`/api/production/tasks/${created.body.id}`)
      .set("X-Role", "allomas")
      .set("X-Station", "CNC")
      .send({ quantity: 99 })
      .expect(403);

    await request(app)
      .patch(`/api/production/tasks/${created.body.id}`)
      .set("X-Role", "allomas")
      .send({ projectKey: secondProject.key })
      .expect(403);
    await request(app)
      .patch(`/api/production/tasks/${created.body.id}`)
      .send({ projectKey: null })
      .expect(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: created.body.id } })).projectId).toBeNull();

    await prisma.task.delete({ where: { id: created.body.id } });
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
    const task = await request(app)
      .post("/api/production/tasks")
      .send({ title: "Megmaradó előzmény", projectKey: project.key, week, day: 1 })
      .expect(201);

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

    await request(app).post(`/api/production/projects/${project.key}/schedule`).send({}).expect(200);
    const issuedFromDeletedEpic = await prisma.task.findFirstOrThrow({
      where: { projectId: project.id, epicName: "Törlendő epik" },
    });
    const issuedFromRemainingEpic = await prisma.task.findFirstOrThrow({
      where: { projectId: project.id, epicName: "Megmaradó epik" },
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
    expect(await prisma.task.findUnique({ where: { id: task.body.id } })).toBeTruthy();

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
    const issued = await request(app).post(`/api/production/projects/${project.key}/schedule`).send({}).expect(200);
    expect(issued.body).toMatchObject({ createdCount: 2, skippedExisting: 0, missingPlanDates: [] });

    const tasks = await prisma.task.findMany({ where: { projectId: project.id }, orderBy: { title: "asc" } });
    expect(tasks).toHaveLength(2);
    expect(tasks.find((task) => task.epicStepId === datedStep.id)).toMatchObject({ week: "2026-07-20", day: 0 });
    expect(tasks.find((task) => task.epicStepId === undatedStep.id)).toMatchObject({ week: "2026-07-20", day: 1 });

    await prisma.task.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
  });

  it("groups every station task by status in Kanban regardless of its week", async () => {
    const [openTask, completedTask, assignedTask, poolTask, futureTask] = await Promise.all([
      request(app)
        .post("/api/production/tasks")
        .send({ title: "Régi, nyitott CNC feladat", station: "CNC", week: previousWeekKey, day: 4 })
        .expect(201),
      request(app)
        .post("/api/production/tasks")
        .send({ title: "Régi, kész CNC feladat", station: "CNC", week: previousWeekKey, day: 4 })
        .expect(201),
      request(app)
        .post("/api/production/tasks")
        .send({ title: "Régi, még fel nem vett CNC feladat", station: "CNC", week: previousWeekKey, day: 4 })
        .expect(201),
      request(app)
        .post("/api/production/tasks")
        .send({ title: "Régi, szabad feladat", week: previousWeekKey, day: 4 })
        .expect(201),
      request(app)
        .post("/api/production/tasks")
        .send({ title: "Jövő heti, folyamatban lévő CNC feladat", station: "CNC", week: nextWeekKey, day: 1 })
        .expect(201),
    ]);

    await request(app).patch(`/api/production/tasks/${openTask.body.id}`).send({ acknowledged: true, stepIndex: 1 }).expect(200);
    await request(app).patch(`/api/production/tasks/${completedTask.body.id}`).send({ acknowledged: true, stepIndex: 2 }).expect(200);
    await request(app).patch(`/api/production/tasks/${futureTask.body.id}`).send({ acknowledged: true, stepIndex: 1 }).expect(200);

    const kanban = await request(app).get(`/api/production/kanban?station=CNC&week=${week}`).expect(200);
    const visibleIds = kanban.body.columns.flatMap((column: { tasks: Array<{ id: string }> }) => column.tasks.map((task) => task.id));

    expect(visibleIds).toContain(openTask.body.id);
    expect(visibleIds).toContain(completedTask.body.id);
    expect(visibleIds).toContain(futureTask.body.id);
    expect(kanban.body.assigned.map((task: { id: string }) => task.id)).toContain(assignedTask.body.id);
    expect(kanban.body.pool.map((task: { id: string }) => task.id)).toContain(poolTask.body.id);
    expect(kanban.body).not.toHaveProperty("carriedOverCount");
  });
});
