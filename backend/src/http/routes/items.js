import { Router } from 'express';
import { idParams, listItemsQuery } from '../schemas.js';
import { validate } from '../middleware/validate.js';

export function createItemsRouter({ itemsService }) {
  const router = Router();

  router.get('/items', validate({ query: listItemsQuery }), (req, res) => {
    res.json(itemsService.list(req.valid.query));
  });

  router.get('/items/:id', validate({ params: idParams }), (req, res) => {
    res.json({ item: itemsService.get(req.valid.params.id) });
  });

  router.delete('/items/:id', validate({ params: idParams }), (req, res) => {
    itemsService.remove(req.valid.params.id);
    res.status(204).end();
  });

  return router;
}
