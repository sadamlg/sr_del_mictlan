import express from 'express';
import { createCatalogHandler } from './catalog/catalog-handler.js';
import { createCatalogRepository } from './catalog/catalog-repository.js';
import { createVisitsHandlers } from './visits/visits-handler.js';
import { createVisitsRepository } from './visits/visits-repository.js';

export function createApp({ database, mediaBaseUrl = 'http://localhost:3000', allowInsecureDevHttp = true }) {
  if (!database) throw new Error('Se requiere una conexión de base de datos.');

  const app = express();
  const catalog = createCatalogRepository(database);
  const visits = createVisitsHandlers(createVisitsRepository(database));

  app.get('/health', async (_request, response) => {
    try {
      await database.$queryRaw`SELECT 1`;
      response.status(200).json({ status: 'ok', database: 'connected' });
    } catch {
      response.status(503).json({ status: 'unavailable', database: 'disconnected' });
    }
  });

  app.get('/api/hello', (_request, response) => {
    response.json({ service: 'backend', message: 'Frontend y backend se comunican.' });
  });

  app.get('/api/catalog/products', createCatalogHandler({
    findActiveProducts: () => catalog.findActiveProducts(), mediaBaseUrl, allowInsecureDevHttp,
  }));
  app.get('/api/visits', visits.get);
  app.post('/api/visits', express.json({ limit: '256b' }), visits.post);
  app.use('/api/visits', (error, _request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (error?.type === 'entity.too.large') return response.status(413).json({ error: { code: 'REQUEST_TOO_LARGE' } });
    if (error instanceof SyntaxError) return response.status(400).json({ error: { code: 'INVALID_VISIT_ID' } });
    return next(error);
  });

  return app;
}
