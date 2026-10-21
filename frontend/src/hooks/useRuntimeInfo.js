import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

/** Which embedding model / answer mode the server is running with (from GET /health). */
export function useRuntimeInfo() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .health(controller.signal)
      .then(setInfo)
      .catch(() => setInfo(null));
    return () => controller.abort();
  }, []);

  return info;
}
