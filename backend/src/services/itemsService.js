import { notFound } from '../errors.js';

export function createItemsService({ itemsRepo, vectorStore }) {
  return {
    list: (pagination) => ({ ...itemsRepo.list(pagination), ...pagination }),

    get(id) {
      const item = itemsRepo.get(id);
      if (!item) throw notFound('Item');
      return item; // includes rawContent, unlike list entries
    },

    remove(id) {
      if (!itemsRepo.remove(id)) throw notFound('Item');
      vectorStore.invalidate(); // chunks vanish via ON DELETE CASCADE
    },
  };
}
