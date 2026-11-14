import express from 'express';
import { createAccountHandlers } from './accounts/account-handler.js';
import { createAccountRateLimit } from './accounts/account-rate-limit.js';
import { createAccountRepository } from './accounts/account-repository.js';
import { createAccountService } from './accounts/account-service.js';
import { createTurnstileVerifier } from './accounts/turnstile-verifier.js';
import { createCatalogHandler } from './catalog/catalog-handler.js';
import { createCatalogRepository } from './catalog/catalog-repository.js';
import { createVisitsHandlers } from './visits/visits-handler.js';
import { createVisitsRepository } from './visits/visits-repository.js';

export function createApp({
  database,
  mediaBaseUrl = 'http://localhost:3000',
  allowInsecureDevHttp = true,
  environment = process.env,
  accountsService,
  verifyTurnstile,
  secureCookies,
  logger = console,
} = {}) {
  if (!database) throw new Error('Se requiere una conexión de base de datos.');

  const app = express();
  app.disable('x-powered-by');
  const catalog = createCatalogRepository(database);
  const visits = createVisitsHandlers(createVisitsRepository(database));
  const configuredOrigin = new URL(environment.FRONTEND_ORIGIN || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(configuredOrigin.protocol)
    || configuredOrigin.username || configuredOrigin.password
    || configuredOrigin.pathname !== '/' || configuredOrigin.search || configuredOrigin.hash) {
    throw new Error('FRONTEND_ORIGIN debe ser un origen HTTP o HTTPS sin ruta.');
  }
  const frontendOrigin = configuredOrigin.origin;
  const accountRepository = createAccountRepository(database);
  const service = accountsService ?? createAccountService({ repository: accountRepository });
  const expectedHostname = configuredOrigin.hostname;
  const turnstile = verifyTurnstile ?? createTurnstileVerifier({
    secretKey: environment.TURNSTILE_SECRET_KEY,
    expectedHostname,
    enforceContext: environment.TURNSTILE_ENFORCE_CONTEXT === 'true' || environment.NODE_ENV === 'production',
  });
  const accountHandlers = createAccountHandlers(service, {
    secureCookies: secureCookies ?? environment.NODE_ENV === 'production',
    verifyTurnstile: turnstile,
    logger,
  });
  const accountRateLimit = createAccountRateLimit();

  app.use((request, response, next) => {
    response.set('X-Content-Type-Options', 'nosniff');
    response.set('X-Frame-Options', 'DENY');
    response.set('Referrer-Policy', 'no-referrer');
    if (request.path.startsWith('/api/')) {
      response.vary('Origin');
      const origin = request.get('origin');
      if (origin && origin !== frontendOrigin) {
        return response.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origen no permitido.' } });
      }
      if (origin === frontendOrigin) {
        response.set('Access-Control-Allow-Origin', origin);
        response.set('Access-Control-Allow-Credentials', 'true');
        response.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
        response.set('Access-Control-Allow-Headers', 'Content-Type');
        response.set('Access-Control-Max-Age', '600');
      }
      if (request.method === 'OPTIONS') return response.status(204).end();
    }
    return next();
  });

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

  const authRouter = express.Router();
  authRouter.use(express.json({ limit: '16kb' }));
  authRouter.post('/register', accountRateLimit, accountHandlers.register);
  authRouter.post('/login', accountRateLimit, accountHandlers.login);
  authRouter.post('/logout', accountRateLimit, accountHandlers.logout);
  authRouter.get('/session', accountHandlers.session);
  authRouter.post('/password-reset-requests', accountRateLimit, accountHandlers.requestPasswordReset);
  authRouter.post('/password-reset-validations', accountRateLimit, accountHandlers.validatePasswordResetToken);
  authRouter.post('/password-resets', accountRateLimit, accountHandlers.resetPassword);
  authRouter.post('/email-confirmations', accountRateLimit, accountHandlers.confirmEmail);
  authRouter.use((error, _request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (error?.type === 'entity.too.large') {
      return response.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'La solicitud supera el tamaño permitido.' } });
    }
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'La solicitud no tiene un formato válido.' } });
    }
    return next(error);
  });
  app.use('/api/auth', authRouter);

  const profileRouter = express.Router();
  profileRouter.use(express.json({ limit: '16kb' }));
  profileRouter.get('/', accountHandlers.getProfile);
  profileRouter.patch('/', accountRateLimit, accountHandlers.updateProfile);
  profileRouter.patch('/password', accountRateLimit, accountHandlers.changePassword);
  profileRouter.use((error, _request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (error?.type === 'entity.too.large') {
      return response.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'La solicitud supera el tamaño permitido.' } });
    }
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'La solicitud no tiene un formato válido.' } });
    }
    return next(error);
  });
  app.use('/api/profile', profileRouter);
  app.get('/api/orders', accountHandlers.orders);

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
