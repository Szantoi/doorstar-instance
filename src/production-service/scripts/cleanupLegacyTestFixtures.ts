import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const fixtureKeys = [
  "DSMR-FEEDBACK-TEST",
  "DSMR-POSITION-EVIDENCE-TEST",
  "DSMR-MANUFACTURED-ITEM-TEST",
  "DSMR-TEST-IMPORT-24181",
];

if (!process.argv.includes("--confirm-legacy-test-fixture-cleanup")) {
  throw new Error("Human confirmation required: --confirm-legacy-test-fixture-cleanup");
}

const schema = new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema");
if (schema !== "doorstar_test") {
  throw new Error("Legacy fixture cleanup is allowed only with DATABASE_URL?schema=doorstar_test");
}

const prisma = new PrismaClient();
try {
  const result = await prisma.project.deleteMany({ where: { key: { in: fixtureKeys } } });
  console.info(JSON.stringify({ cleanup: "completed", deletedProjectCount: result.count, fixtureKeys }));
} finally {
  await prisma.$disconnect();
}
