import { Router } from 'express';
import { ingestBody } from '../schemas.js';
import { validate } from '../middleware/validate.js';

export function createIngestRouter({ ingestionService, limiter }) {
  const router = Router();

  // 202 Accepted: the item is stored as `pending` and processed in the background.
  // Clients poll GET /items (or GET /items/:id) until status is `ready` or `failed`.
  router.post('/ingest', limiter, validate({ body: ingestBody }), (req, res) => {
    const item = ingestionService.submit(req.valid.body);
    res.status(202).location(`/items/${item.id}`).json({ item });
  });

  return router;
}
