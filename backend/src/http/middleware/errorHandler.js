import { AppError } from '../../errors.js';

function normalize(err) {
  if (err instanceof AppError) return err;
  // body-parser errors carry a `type`
  if (err?.type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  if (err?.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Quote the requestId when reporting it.');
}

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

/**
 * One consistent error envelope for every failure:
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...], "requestId": "..." } }
 * Expected 4xx errors are logged at warn by the request logger; 5xx attach the real error
 * (with stack) so it shows up in the log line for that request, never in the response.
 */
export function errorHandler(err, req, res, _next) {
  const appError = normalize(err);
  res.locals.errorCode = appError.code;
  if (appError.status >= 500) res.err = err;

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details && { details: appError.details }),
      requestId: req.id,
    },
  });
}
