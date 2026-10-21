import { useState } from 'react';
import { describeError } from '../api/client.js';

const MODES = [
  { id: 'note', label: 'Note' },
  { id: 'url', label: 'URL' },
];

export default function IngestForm({ onSubmit }) {
  const [mode, setMode] = useState('note');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(mode === 'note' ? { type: 'note', content: value } : { type: 'url', url: value });
      setValue('');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setValue('');
    setError(null);
  };

  return (
    <section className="card" aria-labelledby="add-heading">
      <h2 id="add-heading">Add to your inbox</h2>

      <div className="tabs" role="group" aria-label="Content type">
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`tab ${mode === id ? 'tab-active' : ''}`}
            aria-pressed={mode === id}
            onClick={() => switchMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {mode === 'note' ? (
          <>
            <label htmlFor="note-input">Note</label>
            <textarea
              id="note-input"
              rows={5}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste or type something worth remembering…"
            />
            <p className="hint">For web pages, switch to the URL tab. Notes should contain meaningful readable text.</p>
          </>
        ) : (
          <>
            <label htmlFor="url-input">Page URL</label>
            <input
              id="url-input"
              type="url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://example.com/article"
            />
            <p className="hint">The server downloads the page and extracts its text in the background.</p>
          </>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="primary" disabled={submitting || !value.trim()}>
          {submitting ? 'Saving…' : mode === 'note' ? 'Save note' : 'Save URL'}
        </button>
      </form>
    </section>
  );
}
