import { prisma } from './database/prisma-client.js';
import { recordHeartbeat } from './worker-heartbeat.js';

const heartbeatIntervalMs = 10_000;

await recordHeartbeat(prisma);
console.log('Worker conectado a PostgreSQL.');

const interval = setInterval(() => {
  recordHeartbeat(prisma).catch((error) => {
    console.error('No se pudo guardar la actividad del worker.', error.message);
  });
}, heartbeatIntervalMs);

async function stop() {
  clearInterval(interval);
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
