import { prisma } from './database/prisma-client.js';

try {
  const heartbeat = await prisma.workerHeartbeat.findUnique({ where: { id: 1 } });
  const isRecent = heartbeat && Date.now() - heartbeat.checkedAt.getTime() < 60_000;
  process.exitCode = isRecent ? 0 : 1;
} catch {
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
