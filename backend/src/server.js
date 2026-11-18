import { createShutdown } from './runtime.js';
import { createApp } from './app.js';
import { prisma } from './database/prisma-client.js';

const port = Number(process.env.PORT || 3000);
const app = createApp({
  database: prisma,
  mediaBaseUrl: process.env.MEDIA_BASE_URL || 'http://localhost:3000',
  allowInsecureDevHttp: process.env.NODE_ENV === 'development',
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`API disponible en el puerto ${port}.`);
});

const stop = createShutdown(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
