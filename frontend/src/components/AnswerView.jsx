import { splitCitations } from '../lib/citations.js';

function AnswerText({ answer, sourceCount }) {
  return (
    <p className="answer-text">
      {splitCitations(answer, sourceCount).map((part, i) =>
        part.type === 'cite' ? (
          <a key={i} className="cite" href={`#source-${part.ref}`} aria-label={`Source ${part.ref}`}>
            {part.ref}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </p>
  );
}

function Source({ source }) {
  return (
    <li id={`source-${source.ref}`} className={`source ${source.cited ? 'source-cited' : ''}`}>
      <div className="source-head">
        <span className="source-ref">{source.ref}</span>
        <span className="source-title">
          {source.sourceUrl ? (
            <a href={source.sourceUrl} target="_blank" rel="noreferrer noopener">
              {source.title}
            </a>
          ) : (
            source.title
          )}
        </span>
        <span className="meta">
          {source.cited ? 'cited' : 'retrieved'} · similarity {source.score.toFixed(2)}
        </span>
      </div>
      <blockquote>{source.snippet}</blockquote>
    </li>
  );
}

export default function AnswerView({ result }) {
  const { answer, sources, meta } = result;

  return (
    <div className="answer" aria-live="polite">
      {meta.mode === 'extractive' && (
        <p className="notice">
          No LLM is configured on the server (set <code>GEMINI_API_KEY</code>), so the passages below are returned
          instead of a written answer.
        </p>
      )}
      <AnswerText answer={answer} sourceCount={sources.length} />

      {sources.length > 0 && (
        <>
          <h3>Sources</h3>
          <ol className="sources">
            {sources.map((source) => (
              <Source key={source.chunkId} source={source} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
