import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.mts';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL es necesaria para iniciar Prisma.');
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 15_000,
});

export const prisma = new PrismaClient({ adapter });
