import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { monday } from "../src/domain/dates.js";

const app = createApp();
const week = monday(new Date());

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
});
