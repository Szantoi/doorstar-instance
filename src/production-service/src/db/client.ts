import { PrismaClient } from "@prisma/client";

// Single shared Prisma client for the process, per Prisma's recommended
// singleton pattern (avoids exhausting DB connections under `tsx watch`).
export const prisma = new PrismaClient();
