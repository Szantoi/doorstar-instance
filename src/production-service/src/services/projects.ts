import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

/** Resolve only an active project. Archived projects deliberately remain in
 * the database for task and audit history, but cannot be edited or selected
 * for newly created work without a future explicit restore flow. */
export function findActiveProject(key: string, db: DatabaseClient = prisma) {
  return db.project.findFirst({ where: { key, deletedAt: null } });
}
