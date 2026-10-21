/**
 * Ordered, append-only migrations. `PRAGMA user_version` records how many have run,
 * so adding a schema change means appending a new entry, never editing an old one.
 */
export const MIGRATIONS = [
  `
  CREATE TABLE items (
    id          TEXT PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('note', 'url')),
    title       TEXT,
    source_url  TEXT,
    raw_content TEXT,
    status      TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
    error       TEXT,
    attempts    INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX idx_items_created_at ON items (created_at DESC);
  CREATE INDEX idx_items_status ON items (status);

  -- One row per chunk. The vector is stored as a little-endian float32 BLOB next to
  -- the model that produced it, so vectors from different models are never compared.
  CREATE TABLE chunks (
    id              TEXT PRIMARY KEY,
    item_id         TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    text            TEXT NOT NULL,
    embedding       BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    UNIQUE (item_id, chunk_index)
  );
  CREATE INDEX idx_chunks_model ON chunks (embedding_model);
  `,
];
