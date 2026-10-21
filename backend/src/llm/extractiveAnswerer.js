const MAX_EXCERPT_CHARS = 300;
const PASSAGES_SHOWN = 2;

const excerpt = (text) =>
  text.length <= MAX_EXCERPT_CHARS ? text : `${text.slice(0, MAX_EXCERPT_CHARS).trimEnd()}…`;

/**
 * Fallback used when no LLM is configured: returns the best passages verbatim, with
 * citation markers, so the retrieval half of the pipeline is fully usable offline.
 */
export function createExtractiveAnswerer() {
  return {
    mode: 'extractive',
    model: 'none',
    async answer({ contexts }) {
      const passages = contexts
        .slice(0, PASSAGES_SHOWN)
        .map((c) => `[${c.ref}] ${excerpt(c.text)}`)
        .join('\n\n');
      return {
        answer: `No language model is configured, so these are the most relevant saved passages:\n\n${passages}`,
        model: 'none',
        mode: 'extractive',
      };
    },
  };
}
