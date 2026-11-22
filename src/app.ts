import express, { type Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { config } from './config.js';
import { query } from './db.js';
import { csrfGuard } from './middleware/csrf-guard.js';
import { attachUser } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { apiRouter } from './routes/api.js';
import { webRouter } from './routes/web.js';

// src/app.ts (dev, tests) and dist/app.js (production) sit at the same depth, so both resolve the
// project root (and its public/ folder) the same way. Pages are TSX components in src/views,
// compiled with the rest of the code: there is no template engine and nothing read from disk.
const root = path.join(import.meta.dirname, '..');

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1); // Render terminates TLS: correct req.protocol, Secure cookies, client IP
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        // upgrade-insecure-requests would break plain-http localhost; only send it in production.
        directives: { upgradeInsecureRequests: config.isProd ? [] : null },
      },
    }),
  );
  app.use(express.static(path.join(root, 'public'), { maxAge: config.isProd ? '1h' : 0 }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  // Liveness + version: the pipeline polls this until it reports the commit it just deployed.
  app.get('/healthz', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({ ok: true, db: 'up', commit: config.commit });
    } catch {
      res.status(503).json({ ok: false, db: 'down', commit: config.commit });
    }
  });

  app.use(csrfGuard);
  app.use(attachUser);
  app.use('/api', apiRouter);
  app.use('/', webRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
