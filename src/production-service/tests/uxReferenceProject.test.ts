import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedUxReferenceProject } from "../scripts/uxReferenceProjectFixture.js";
import { UX_REFERENCE_PROJECT_KEY } from "../scripts/uxReferenceProjectTarget.js";

const prisma = new PrismaClient();

describe("UX reference project fixture", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("rebuilds one stable project through the full current authority chain", async () => {
    const input = {
      databaseUrl: process.env.DATABASE_URL,
      arguments: ["--confirm-ux-reference-seed"],
      nodeEnv: "test",
    };
    const first = await seedUxReferenceProject(input);
    const second = await seedUxReferenceProject(input);

    expect(first).toMatchObject({
      projectKey: UX_REFERENCE_PROJECT_KEY,
      revision: 2,
      orderStatus: "APPROVED",
      positionCount: 3,
      documentCount: 3,
      componentSnapshotState: "VERIFIED",
      componentRequirementCount: 7,
      operationPlanState: "VERIFIED",
      operationCount: 4,
      productionReleaseState: "NOT_AVAILABLE",
    });
    expect(second).toMatchObject({
      projectKey: UX_REFERENCE_PROJECT_KEY,
      revision: 2,
      orderStatus: "APPROVED",
      componentSnapshotState: "VERIFIED",
      operationPlanState: "VERIFIED",
    });
    expect(await prisma.project.count({ where: { key: UX_REFERENCE_PROJECT_KEY } })).toBe(1);

    const project = await prisma.project.findUniqueOrThrow({
      where: { key: UX_REFERENCE_PROJECT_KEY },
      include: {
        order: {
          include: {
            revisions: {
              orderBy: { revision: "desc" },
              include: {
                positions: { include: { evidence: true } },
                documents: true,
                manufacturedItems: { include: { evidence: true } },
                supplementaryItems: true,
                componentSnapshots: { include: { requirements: true } },
                operationPlanSnapshots: true,
              },
            },
          },
        },
      },
    });
    expect(project.order?.revisions).toHaveLength(2);
    expect(project.order?.revisions.map((item) => [item.revision, item.status])).toEqual([
      [2, "APPROVED"],
      [1, "SUPERSEDED"],
    ]);
    const current = project.order!.revisions[0]!;
    expect(current.positions).toHaveLength(3);
    expect(current.positions.flatMap((position) => position.evidence).every((evidence) => evidence.reviewState === "RESOLVED")).toBe(true);
    expect(current.manufacturedItems).toEqual([
      expect.objectContaining({ kind: "WALL_PANEL", state: "VERIFIED", evidence: [expect.objectContaining({ reviewState: "RESOLVED" })] }),
    ]);
    expect(current.supplementaryItems).toEqual([
      expect.objectContaining({ entryMode: "MANUAL", state: "VERIFIED" }),
    ]);
    expect(current.componentSnapshots).toEqual([
      expect.objectContaining({ state: "VERIFIED", requirements: expect.any(Array) }),
    ]);
    expect(current.componentSnapshots[0]!.requirements).toHaveLength(7);
    expect(current.operationPlanSnapshots).toEqual([
      expect.objectContaining({ state: "VERIFIED" }),
    ]);
    expect(current.operationPlanSnapshots[0]!.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ux-reference:cutting" }),
      expect.objectContaining({ id: "ux-reference:packaging" }),
    ]));
  }, 30_000);
});

