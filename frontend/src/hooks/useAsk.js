import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

const IDLE = { status: 'idle', question: '', result: null, error: null };

/**
 * Question/answer state machine: idle -> loading -> success | error.
 * Asking again aborts the previous request, so a slow stale answer can never overwrite a newer one.
 */
export function useAsk() {
  const [state, setState] = useState(IDLE);
  const controllerRef = useRef(null);

  const ask = useCallback(async (question) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({ status: 'loading', question, result: null, error: null });
    try {
      const result = await api.ask(question, controller.signal);
      setState({ status: 'success', question, result, error: null });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setState({ status: 'error', question, result: null, error: err });
    }
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { ...state, ask };
}
