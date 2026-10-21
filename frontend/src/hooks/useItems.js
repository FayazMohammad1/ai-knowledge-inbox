import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

const POLL_INTERVAL_MS = 1500;
const isInFlight = (item) => item.status === 'pending' || item.status === 'processing';

/**
 * Owns the list of saved items. Because ingestion is asynchronous on the server, the
 * hook polls only while at least one item is still pending/processing, and stops once
 * everything has settled.
 */
export function useItems() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async (signal) => {
    try {
      const data = await api.listItems(signal);
      setItems(data.items);
      setError(null);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const hasInFlight = items.some(isInFlight);
  useEffect(() => {
    if (!hasInFlight) return undefined;
    const timer = setInterval(() => refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasInFlight, refresh]);

  /** Throws on failure so the calling form can show the error next to its inputs. */
  const addItem = useCallback(async (payload) => {
    const { item } = await api.ingest(payload);
    setItems((current) => [item, ...current]);
  }, []);

  const removeItem = useCallback(async (id) => {
    await api.deleteItem(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  return { items, loading, error, addItem, removeItem };
}
