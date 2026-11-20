import { prisma } from './database/prisma-client.js';
import { createAccountRepository } from './accounts/account-repository.js';
import { createEmailWorker } from './email/email-worker.js';
import { createEmailTransport } from './email/email-transport.js';
import { createSerialTask, createShutdown } from './runtime.js';
import { recordHeartbeat } from './worker-heartbeat.js';
import { createWorkerHealthchecks } from './worker-healthchecks.js';

const heartbeatIntervalMs = 10_000;
const emailIntervalMs = 2_000;
const safeCode = (value) => typeof value === 'string' && /^[A-Z0-9_-]{1,48}$/.test(value) ? value : undefined;
const pingHealthchecks = createWorkerHealthchecks({ pingUrl: process.env.HEALTHCHECKS_WORKER_PING_URL });

const emailTransport = createEmailTransport(process.env);
if (process.env.EMAIL_TRANSPORT === 'resend') {
  if (!process.env.MAIL_FROM?.trim()) {
    throw Object.assign(new Error('MAIL_FROM is required for the Worker.'), { code: 'MAIL_FROM_MISSING' });
  }
  if (!process.env.RESEND_FROM?.trim()) {
    throw Object.assign(new Error('RESEND_FROM is required for the Worker.'), { code: 'RESEND_FROM_MISSING' });
  }
}
const emailWorker = createEmailWorker({
  repository: createAccountRepository(prisma),
  transport: emailTransport,
  accountFrom: process.env.MAIL_FROM || 'Señor del Mictlán <no-reply@local.test>',
  purchaseFrom: process.env.RESEND_FROM || 'Señor del Mictlán · Compras <compras@local.test>',
  appBaseUrl: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  logger: console,
});

async function refreshWorkerHeartbeat() {
  await recordHeartbeat(prisma);
  await pingHealthchecks();
}

await refreshWorkerHeartbeat();
console.log('Worker conectado a PostgreSQL.');


function logEmailJobError(error) {
  const code = safeCode(error?.code);
  console.error('No se pudo procesar la cola de correo.', {
    name: error instanceof Error ? error.name : 'UnknownError',
    ...(code ? { code } : {}),
  });
}

const heartbeatTask = createSerialTask(refreshWorkerHeartbeat, heartbeatIntervalMs, () => {
  console.error('No se pudo guardar la actividad del worker.');
});
const emailTask = createSerialTask(() => emailWorker.processNext(), emailIntervalMs, logEmailJobError);
const stop = createShutdown(async () => {
  await Promise.all([heartbeatTask.stop(), emailTask.stop()]);
  emailTransport.close?.();
  await prisma.$disconnect();
});

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
