import { PrismaClient } from '@prisma/client';

// Soft MySQL validation: if not mysql:// we mark Prisma disabled instead of throwing.
const rawUrl = process.env.DATABASE_URL || '';
let prismaDisabled = false;
if (!/^mysql:\/\//i.test(rawUrl)) {
  prismaDisabled = true;
}

let prisma: PrismaClient | undefined;

export function isPrismaDisabled() { return prismaDisabled; }

export function getPrisma(): PrismaClient {
  if (prismaDisabled) {
    throw new Error('Prisma disabled (DATABASE_URL must start with mysql://)');
  }
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export type { PrismaClient };
