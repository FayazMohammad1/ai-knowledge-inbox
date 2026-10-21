import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';

const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

/** One structured log line per request, tagged with a request id that is also returned to the client. */
export function requestLogger(logger) {
  return pinoHttp({
    logger,
    genReqId(req, res) {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === '/health' },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    customProps: (_req, res) => (res.locals.errorCode ? { errorCode: res.locals.errorCode } : {}),
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  });
}
