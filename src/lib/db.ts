import { PrismaClient } from "@prisma/client";

type GlobalWithPrisma = typeof globalThis & {
  __prisma?: PrismaClient;
};

const g = globalThis as GlobalWithPrisma;

// Prisma v7 + Next build: avoid touching DB during build-time rendering.
// Use a vanilla client; runtime uses DATABASE_URL from env.
export const prisma: PrismaClient = g.__prisma ?? new PrismaClient({});

if (process.env.NODE_ENV !== "production") g.__prisma = prisma;
