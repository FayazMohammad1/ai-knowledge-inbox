const PREVIEW_CHARS = 200;

/** Map a DB row to the public item shape. Raw content is excluded from list payloads. */
function toItem(row) {
  return {
    id: row.id,
    sourceType: row.source_type,
    title: row.title ?? row.source_url,
    sourceUrl: row.source_url,
    status: row.status,
    error: row.error,
    chunkCount: row.chunk_count,
    preview: row.raw_content ? row.raw_content.slice(0, PREVIEW_CHARS) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const now = () => new Date().toISOString();

export function createItemsRepo(db) {
  const statements = {
    insert: db.prepare(`
      INSERT INTO items (id, source_type, title, source_url, raw_content, status, created_at, updated_at)
      VALUES (@id, @sourceType, @title, @sourceUrl, @rawContent, 'pending', @ts, @ts)
    `),
    byId: db.prepare('SELECT * FROM items WHERE id = ?'),
    list: db.prepare('SELECT * FROM items ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?'),
    count: db.prepare('SELECT COUNT(*) AS total FROM items'),
    unfinished: db.prepare("SELECT id FROM items WHERE status IN ('pending', 'processing') ORDER BY created_at"),
    markProcessing: db.prepare(`
      UPDATE items SET status = 'processing', attempts = attempts + 1, error = NULL, updated_at = @ts
      WHERE id = @id
    `),
    markReady: db.prepare(`
      UPDATE items
      SET status = 'ready', title = COALESCE(title, @title), raw_content = @rawContent,
          chunk_count = @chunkCount, error = NULL, updated_at = @ts
      WHERE id = @id
    `),
    markFailed: db.prepare("UPDATE items SET status = 'failed', error = @error, updated_at = @ts WHERE id = @id"),
    remove: db.prepare('DELETE FROM items WHERE id = ?'),
  };

  return {
    create({ id, sourceType, title = null, sourceUrl = null, rawContent = null }) {
      statements.insert.run({ id, sourceType, title, sourceUrl, rawContent, ts: now() });
      return toItem(statements.byId.get(id)); // public shape: no raw content echoed back
    },

    get(id) {
      const row = statements.byId.get(id);
      return row ? { ...toItem(row), rawContent: row.raw_content, attempts: row.attempts } : null;
    },

    /** Raw stored fields for the background job (title stays null until known, unlike the public DTO). */
    getForProcessing(id) {
      const row = statements.byId.get(id);
      return row
        ? { id: row.id, sourceType: row.source_type, sourceUrl: row.source_url, title: row.title, rawContent: row.raw_content }
        : null;
    },

    list({ limit, offset }) {
      return {
        items: statements.list.all(limit, offset).map(toItem),
        total: statements.count.get().total,
      };
    },

    listUnfinishedIds() {
      return statements.unfinished.all().map((row) => row.id);
    },

    markProcessing(id) {
      statements.markProcessing.run({ id, ts: now() });
    },

    markReady(id, { title, rawContent, chunkCount }) {
      statements.markReady.run({ id, title, rawContent, chunkCount, ts: now() });
    },

    markFailed(id, error) {
      statements.markFailed.run({ id, error, ts: now() });
    },

    remove(id) {
      return statements.remove.run(id).changes > 0;
    },
  };
}
