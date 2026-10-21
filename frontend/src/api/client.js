// All HTTP knowledge lives here; components and hooks never call fetch directly.
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Cannot reach the server. Is the API running on port 4000?',
    });
  }

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data?.error;
    throw new ApiError({
      status: response.status,
      code: error?.code ?? 'HTTP_ERROR',
      message: error?.message ?? `Request failed with status ${response.status}`,
      details: error?.details,
      requestId: error?.requestId,
    });
  }
  return data;
}

/** One human-readable line for an error, including field-level validation details. */
export function describeError(err) {
  const details = err.details?.map((d) => d.message).join('; ');
  return details ? `${err.message}: ${details}` : err.message;
}

export const api = {
  health: (signal) => request('/health', { signal }),
  listItems: (signal) => request('/items?limit=100', { signal }),
  getItem: (id, signal) => request(`/items/${id}`, { signal }),
  ingest: (payload) => request('/ingest', { method: 'POST', body: payload }),
  deleteItem: (id) => request(`/items/${id}`, { method: 'DELETE' }),
  ask: (question, signal) => request('/query', { method: 'POST', body: { question }, signal }),
};
