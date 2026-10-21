import { buildGeminiClient } from '../embeddings/geminiEmbedder.js';
import { createExtractiveAnswerer } from './extractiveAnswerer.js';
import { createGeminiAnswerer } from './geminiAnswerer.js';

export function createAnswerer(config) {
  if (config.providers.llm === 'gemini') {
    if (!config.gemini.apiKey) {
      throw new Error('LLM_PROVIDER=gemini requires GEMINI_API_KEY');
    }
    return createGeminiAnswerer({
      client: buildGeminiClient(config.gemini),
      model: config.gemini.chatModel,
    });
  }
  return createExtractiveAnswerer();
}
