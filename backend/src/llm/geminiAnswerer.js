import { createUserContent } from '@google/genai';
import { toUpstreamError, UpstreamError } from '../errors.js';
import { buildMessages } from './prompt.js';

/**
 * Answerer interface: answer({ question, contexts }) -> { answer, model, mode }.
 * `client` is injectable for tests.
 */
export function createGeminiAnswerer({ client, model }) {
  return {
    mode: 'llm',
    model,
    async answer({ question, contexts }) {
      const [system, user] = buildMessages(question, contexts);
      let completion;
      try {
        completion = await client.models.generateContent({
          model,
          contents: createUserContent(user.content),
          config: { systemInstruction: system.content, maxOutputTokens: 600 },
        });
      } catch (err) {
        throw toUpstreamError(err, 'Language model request');
      }

      const answer = completion.text?.trim();
      if (!answer) {
        throw new UpstreamError('The language model returned an empty answer');
      }
      return { answer, model, mode: 'llm', usage: completion.usageMetadata ?? null };
    },
  };
}
