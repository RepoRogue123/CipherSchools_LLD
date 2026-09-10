import path from 'node:path';
import express, { type Express } from 'express';
import { silentLogger, type Logger } from '../application/logger';
import type { Container } from '../container';
import { errorHandler } from './errors';
import { apiRouter } from './routes';

export interface AppOptions {
  /** Built web app to serve (production); omitted in development, where Vite serves it. */
  webDistDir?: string | null;
  logger?: Logger;
}

export function createApp(container: Container, options: AppOptions = {}): Express {
  const logger = options.logger ?? silentLogger;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));

  app.use('/api', apiRouter(container));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } });
  });

  if (options.webDistDir) {
    const indexHtml = path.join(options.webDistDir, 'index.html');
    app.use(express.static(options.webDistDir));
    // Client-side routes: serve the SPA shell for any other GET.
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler(logger));
  return app;
}
