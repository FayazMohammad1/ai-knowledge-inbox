import { ZodError } from 'zod';
import { validationError } from '../../errors.js';

const formatIssues = (error) =>
  error.issues.map((issue) => ({ path: issue.path.join('.') || '(body)', message: issue.message }));

/**
 * validate({ body, query, params }) parses each part with its zod schema and stores
 * the result on `req.valid`. (Express 5 makes req.query read-only, so we never mutate req.)
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    req.valid = {};
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) req.valid[part] = schemas[part].parse(req[part] ?? {});
    }
    next();
  } catch (err) {
    next(err instanceof ZodError ? validationError('Invalid request', formatIssues(err)) : err);
  }
};
