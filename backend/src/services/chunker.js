/**
 * Chunking strategy: structure-aware greedy packing with overlap.
 *
 *   1. Break the text into "units": lines, remembering where blank lines (paragraph
 *      breaks) were. Lines longer than `maxChars` are split into sentences, and
 *      sentences that are still too long are split on words.
 *   2. Pack units greedily into chunks of at most `maxChars`, so a chunk usually
 *      holds whole paragraphs / list items and never cuts a sentence in half
 *      unless the sentence itself is huge.
 *   3. Each new chunk starts with the tail (~`overlapChars`) of the previous one so
 *      an answer sitting on a boundary is still retrievable from either side.
 *
 * Why ~800 chars (~200 tokens)? Small chunks give precise retrieval and keep the
 * prompt cheap; much larger chunks blur several topics into one vector. The values
 * are configurable because the right size depends on the content and the model.
 */
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

export function chunkText(text, { maxChars = 800, overlapChars = 100 } = {}) {
  if (overlapChars >= maxChars) {
    throw new RangeError('overlapChars must be smaller than maxChars');
  }

  const units = toUnits(text, maxChars);
  const chunks = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
  };

  for (const unit of units) {
    const separator = current ? unit.separator : '';
    if (current && current.length + separator.length + unit.text.length > maxChars) {
      flush();
      current = overlapSeed(chunks.at(-1), overlapChars);
      // The overlap must never push a chunk over the limit.
      if (current && current.length + unit.separator.length + unit.text.length > maxChars) {
        current = '';
      }
    }
    current = current ? `${current}${unit.separator}${unit.text}` : unit.text;
  }
  flush();

  return chunks.map((chunk, index) => ({ index, text: chunk }));
}

/** Split text into {text, separator} units; `separator` is what to put before the unit when joining. */
function toUnits(text, maxChars) {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
  if (!normalized) return [];

  const units = [];
  let afterBlankLine = false;

  for (const line of normalized.split('\n')) {
    if (!line) {
      afterBlankLine = true;
      continue;
    }
    const lineSeparator = afterBlankLine ? '\n\n' : '\n';
    afterBlankLine = false;

    splitOversized(line, maxChars).forEach((piece, i) => {
      units.push({ text: piece, separator: i === 0 ? lineSeparator : ' ' });
    });
  }
  return units;
}

function splitOversized(line, maxChars) {
  if (line.length <= maxChars) return [line];
  return line
    .split(SENTENCE_BOUNDARY)
    .flatMap((sentence) => (sentence.length <= maxChars ? [sentence] : splitOnWords(sentence, maxChars)));
}

function splitOnWords(sentence, maxChars) {
  const pieces = [];
  let current = '';
  for (const word of sentence.split(' ')) {
    // A single token longer than the limit (a long URL, base64...) is hard-cut.
    for (let start = 0; start < word.length || start === 0; start += maxChars) {
      const part = word.slice(start, start + maxChars);
      if (current && current.length + 1 + part.length > maxChars) {
        pieces.push(current);
        current = part;
      } else {
        current = current ? `${current} ${part}` : part;
      }
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Last ~n chars of the previous chunk, trimmed to start on a word boundary. */
function overlapSeed(previousChunk, overlapChars) {
  if (!previousChunk || overlapChars <= 0) return '';
  if (previousChunk.length <= overlapChars) return previousChunk;
  const tail = previousChunk.slice(-overlapChars);
  const firstSpace = tail.search(/\s/);
  return (firstSpace === -1 ? tail : tail.slice(firstSpace + 1)).trim();
}
