/**
 * Error types shared across layers.
 *
 *  - AppError       -> something we can describe to an HTTP client (status + stable code).
 *  - UpstreamError  -> an AppError for failures of an external provider (Gemini, ...).
 *  - IngestionError -> failure inside a background job; `retryable` tells the queue
 *                      whether another attempt could possibly help.
 */
export class AppError extends Error {
  constructor(status, code, message, { details, cause } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const validationError = (message, details) =>
  new AppError(400, 'VALIDATION_ERROR', message, { details });

export const notFound = (what) => new AppError(404, 'NOT_FOUND', `${what} not found`);

export class UpstreamError extends AppError {
  constructor(message, { status = 502, retryable = true, cause } = {}) {
    super(status, 'UPSTREAM_ERROR', message, { cause });
    this.name = 'UpstreamError';
    this.retryable = retryable;
  }
}

export class IngestionError extends Error {
  constructor(message, { retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'IngestionError';
    this.retryable = retryable;
  }
}

/**
 * Translate an error thrown by a provider SDK into our UpstreamError.
 * 4xx (except 429) means our request/credentials are wrong, so retrying is pointless.
 */
export function toUpstreamError(err, action) {
  const upstreamStatus = err?.status ?? err?.statusCode;
  const clientFault = upstreamStatus >= 400 && upstreamStatus < 500 && upstreamStatus !== 429;
  const hint = upstreamStatus === 401 ? ' (check GEMINI_API_KEY)' : '';
  const suffix = upstreamStatus ? ` with upstream status ${upstreamStatus}` : '';
  return new UpstreamError(`${action} failed${suffix}${hint}`, {
    status: upstreamStatus === 429 ? 503 : 502,
    retryable: !clientFault,
    cause: err,
  });
}
