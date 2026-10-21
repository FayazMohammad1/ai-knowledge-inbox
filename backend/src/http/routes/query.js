import { Router } from 'express';
import { queryBody } from '../schemas.js';
import { validate } from '../middleware/validate.js';

export function createQueryRouter({ queryService, limiter }) {
  const router = Router();

  router.post('/query', limiter, validate({ body: queryBody }), async (req, res) => {
    // Express 5 forwards rejected promises to the error handler, so no try/catch needed.
    const result = await queryService.answer(req.valid.body, { log: req.log });
    res.json(result);
  });

  return router;
}
