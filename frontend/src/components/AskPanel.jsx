import { useState } from 'react';
import { describeError } from '../api/client.js';
import { useAsk } from '../hooks/useAsk.js';
import AnswerView from './AnswerView.jsx';

export default function AskPanel({ readyCount }) {
  const [draft, setDraft] = useState('');
  const { status, question, result, error, ask } = useAsk();

  const handleSubmit = (event) => {
    event.preventDefault();
    if (draft.trim().length >= 3) ask(draft.trim());
  };

  return (
    <section className="card" aria-labelledby="ask-heading">
      <h2 id="ask-heading">Ask your inbox</h2>

      <form onSubmit={handleSubmit}>
        <label htmlFor="question-input">Question</label>
        <input
          id="question-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. How many times are failed jobs retried?"
        />
        {readyCount === 0 && <p className="hint">Nothing is searchable yet: add an item and wait for it to be ready.</p>}
        <button type="submit" className="primary" disabled={status === 'loading' || draft.trim().length < 3}>
          {status === 'loading' ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {status === 'loading' && <p className="hint">Searching your saved content for “{question}”…</p>}
      {status === 'error' && (
        <p className="error" role="alert">
          {describeError(error)}
          {error.requestId && <span className="meta"> (request {error.requestId.slice(0, 8)})</span>}
        </p>
      )}
      {status === 'success' && <AnswerView result={result} />}
    </section>
  );
}
