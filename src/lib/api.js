/**
 * Client-side JSON fetch for the `/api/hub/*` proxy.
 *
 * Throws on a non-2xx response with the parsed error message, and tags the error
 * with `.status` so the React Query cache can single out a 401 (dead session)
 * and redirect the operator to /login. See `providers.jsx`.
 */
export async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body?.detail || body?.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}
