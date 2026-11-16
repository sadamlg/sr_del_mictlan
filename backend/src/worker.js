import { prisma } from './database/prisma-client.js';
import { createAccountRepository } from './accounts/account-repository.js';
import { createAccountEmailWorker } from './email/account-email-worker.js';
import { createSmtpTransport } from './email/smtp-transport.js';
import { recordHeartbeat } from './worker-heartbeat.js';

const heartbeatIntervalMs = 10_000;
const emailIntervalMs = 2_000;
const safeCode = (value) => typeof value === 'string' && /^[A-Z0-9_-]{1,48}$/.test(value) ? value : undefined;

const emailTransport = createSmtpTransport(process.env);
const emailWorker = createAccountEmailWorker({
  repository: createAccountRepository(prisma),
  transport: emailTransport,
  from: process.env.MAIL_FROM || 'Señor del Mictlán <no-reply@local.test>',
  appBaseUrl: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  logger: console,
});

await recordHeartbeat(prisma);
console.log('Worker conectado a PostgreSQL.');

const interval = setInterval(() => {
  recordHeartbeat(prisma).catch((error) => {
    console.error('No se pudo guardar la actividad del worker.', error.message);
  });
}, heartbeatIntervalMs);

async function processEmailJob() {
  try {
    await emailWorker.processNext();
  } catch (error) {
    console.error('No se pudo procesar la cola de correo.', {
      name: error instanceof Error ? error.name : 'UnknownError',
      ...(safeCode(error?.code) ? { code: safeCode(error.code) } : {}),
    });
  }
}

void processEmailJob();
const emailInterval = setInterval(() => { void processEmailJob(); }, emailIntervalMs);

async function stop() {
  clearInterval(interval);
  clearInterval(emailInterval);
  emailTransport.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
