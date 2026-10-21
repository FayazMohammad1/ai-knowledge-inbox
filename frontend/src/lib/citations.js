/**
 * Split an answer into plain-text and citation parts so React can render citations as
 * links without dangerouslySetInnerHTML. Markers outside 1..maxRef stay plain text, so a
 * hallucinated "[7]" never links to a source that does not exist.
 *
 * @returns {Array<{type:'text', value:string} | {type:'cite', ref:number}>}
 */
export function splitCitations(answer, maxRef) {
  const parts = [];
  let cursor = 0;

  for (const match of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const ref = Number(match[1]);
    if (ref < 1 || ref > maxRef) continue;
    if (match.index > cursor) parts.push({ type: 'text', value: answer.slice(cursor, match.index) });
    parts.push({ type: 'cite', ref });
    cursor = match.index + match[0].length;
  }

  if (cursor < answer.length) parts.push({ type: 'text', value: answer.slice(cursor) });
  return parts;
}
