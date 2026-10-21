import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../errors.js';

const build = (windowMs, limit) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Too many requests, please slow down and retry shortly')),
  });

/** Cheap protection for the endpoints that spend money (embeddings / LLM calls). */
export function createRateLimiters({ windowMs, ingestMax, queryMax }) {
  return { ingest: build(windowMs, ingestMax), query: build(windowMs, queryMax) };
}
