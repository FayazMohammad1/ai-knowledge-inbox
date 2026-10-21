import 'dotenv/config';
import path from 'node:path';

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const float = (value, fallback) => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value, fallback) =>
  value === undefined ? fallback : ['1', 'true', 'yes'].includes(String(value).toLowerCase());

/**
 * All configuration lives here, read once at startup, so no other module
 * touches process.env. Every value has a safe default so `npm run dev` works
 * with zero setup (no API key => local embeddings + extractive answers).
 */
export function loadConfig(env = process.env) {
  const apiKey = env.GEMINI_API_KEY || '';

  return Object.freeze({
    env: env.NODE_ENV ?? 'development',
    port: int(env.PORT, 4000),
    logLevel: env.LOG_LEVEL ?? 'info',
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    dbPath: env.DB_PATH ?? path.resolve('data/inbox.db'),

    gemini: {
      apiKey,
      embeddingModel: env.EMBEDDING_MODEL ?? 'gemini-embedding-001',
      chatModel: env.CHAT_MODEL ?? 'gemini-2.5-flash',
      timeoutMs: int(env.GEMINI_TIMEOUT_MS, 30_000),
    },

    providers: {
      embeddings: env.EMBEDDING_PROVIDER ?? (apiKey ? 'gemini' : 'local'),
      llm: env.LLM_PROVIDER ?? (apiKey ? 'gemini' : 'extractive'),
    },

    chunking: {
      maxChars: int(env.CHUNK_MAX_CHARS, 800),
      overlapChars: int(env.CHUNK_OVERLAP_CHARS, 100),
    },

    retrieval: {
      defaultTopK: int(env.RETRIEVAL_TOP_K, 4),
      // null => use the embedder's own default: similarity scales differ per embedding model.
      minScore: env.RETRIEVAL_MIN_SCORE === undefined ? null : float(env.RETRIEVAL_MIN_SCORE, null),
    },

    ingestion: {
      concurrency: int(env.INGEST_CONCURRENCY, 2),
      maxAttempts: int(env.INGEST_MAX_ATTEMPTS, 3),
      retryBaseMs: int(env.INGEST_RETRY_BASE_MS, 1_000),
    },

    urlFetch: {
      timeoutMs: int(env.URL_FETCH_TIMEOUT_MS, 10_000),
      maxBytes: int(env.URL_FETCH_MAX_BYTES, 2 * 1024 * 1024),
      maxRedirects: 5,
      // Never enable in production: it disables the SSRF guard.
      allowPrivateHosts: bool(env.ALLOW_PRIVATE_URLS, false),
    },

    rateLimit: {
      windowMs: 60_000,
      ingestMax: int(env.RATE_LIMIT_INGEST_PER_MIN, 30),
      queryMax: int(env.RATE_LIMIT_QUERY_PER_MIN, 30),
    },
  });
}
