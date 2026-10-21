import pino from 'pino';

/**
 * Structured JSON logs in production; human-readable in development.
 * Level 'silent' is used by the tests.
 */
export function createLogger({ logLevel, env }) {
  return pino({
    level: logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    transport: env === 'development' && logLevel !== 'silent' ? { target: 'pino-pretty' } : undefined,
  });
}
