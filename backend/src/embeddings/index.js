import { createLocalHashEmbedder } from './localHashEmbedder.js';
import { buildGeminiClient, createGeminiEmbedder } from './geminiEmbedder.js';

export function createEmbedder(config) {
  if (config.providers.embeddings === 'gemini') {
    if (!config.gemini.apiKey) {
      throw new Error('EMBEDDING_PROVIDER=gemini requires GEMINI_API_KEY');
    }
    return createGeminiEmbedder({
      client: buildGeminiClient(config.gemini),
      model: config.gemini.embeddingModel,
    });
  }
  return createLocalHashEmbedder();
}
