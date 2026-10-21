/** Float32Array <-> Buffer conversions (copying on read keeps the typed array aligned). */
const toBlob = (vector) => Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
const fromBlob = (blob) =>
  new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength));

export function createChunksRepo(db) {
  const statements = {
    deleteForItem: db.prepare('DELETE FROM chunks WHERE item_id = ?'),
    insert: db.prepare(`
      INSERT INTO chunks (id, item_id, chunk_index, text, embedding, embedding_model)
      VALUES (@id, @itemId, @index, @text, @embedding, @model)
    `),
    allForModel: db.prepare(`
      SELECT c.id, c.item_id, c.chunk_index, c.text, c.embedding,
             i.title, i.source_type, i.source_url
      FROM chunks c
      JOIN items i ON i.id = c.item_id
      WHERE c.embedding_model = ? AND i.status = 'ready'
    `),
  };

  return {
    /**
     * Replace all chunks of an item. Re-processing an item is therefore idempotent.
     * Call inside a transaction together with marking the item ready.
     */
    replaceForItem(itemId, chunks) {
      statements.deleteForItem.run(itemId);
      for (const chunk of chunks) {
        statements.insert.run({
          id: chunk.id,
          itemId,
          index: chunk.index,
          text: chunk.text,
          embedding: toBlob(chunk.embedding),
          model: chunk.model,
        });
      }
    },

    loadAllForModel(model) {
      return statements.allForModel.all(model).map((row) => ({
        chunkId: row.id,
        itemId: row.item_id,
        chunkIndex: row.chunk_index,
        text: row.text,
        vector: fromBlob(row.embedding),
        title: row.title ?? row.source_url,
        sourceType: row.source_type,
        sourceUrl: row.source_url,
      }));
    },
  };
}
