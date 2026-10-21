import cors from 'cors';
import express from 'express';
import { errorHandler, notFoundHandler } from './http/middleware/errorHandler.js';
import { createRateLimiters } from './http/middleware/rateLimiters.js';
import { requestLogger } from './http/middleware/requestLogger.js';
import { createIngestRouter } from './http/routes/ingest.js';
import { createItemsRouter } from './http/routes/items.js';
import { createQueryRouter } from './http/routes/query.js';

/** Pure HTTP wiring: takes already-built services, knows nothing about SQLite or Gemini. */
export function createApp({ config, logger, services, describeRuntime }) {
  const app = express();
  const limiters = createRateLimiters(config.rateLimit);

  app.disable('x-powered-by');
  app.use(requestLogger(logger));
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '512kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', ...describeRuntime() }));
  app.use(createIngestRouter({ ingestionService: services.ingestion, limiter: limiters.ingest }));
  app.use(createItemsRouter({ itemsService: services.items }));
  app.use(createQueryRouter({ queryService: services.query, limiter: limiters.query }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
