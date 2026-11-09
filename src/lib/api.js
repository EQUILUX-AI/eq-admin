/**
 * Client-side JSON fetch for the `/api/hub/*` proxy.
 *
 * Throws on a non-2xx response with the parsed error message, and tags the error
 * with `.status` so the React Query cache can single out a 401 (dead session)
 * and redirect the operator to /login. See `providers.jsx`.
 */
export async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw await toError(res);
  return res.json();
}

/**
 * JSON write (POST/PATCH/DELETE) through the same proxy. Resolves to the parsed
 * body, or null for an empty (204) response; throws like `fetchJson`.
 */
export async function mutateJson(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Build an Error from a failed response. DRF validation errors come back as
 *  `{field: [msg, ...]}` (or a bare list) — flatten them into one readable
 *  message and keep the raw map on `.fields`. */
async function toError(res) {
  const body = await res.json().catch(() => ({}));
  const error = new Error(
    body?.detail || body?.error || formatFieldErrors(body) || `Request failed (${res.status})`,
  );
  error.status = res.status;
  if (body && typeof body === 'object' && !Array.isArray(body)) error.fields = body;
  return error;
}

function formatFieldErrors(body) {
  if (Array.isArray(body)) return body.join(' ');
  if (!body || typeof body !== 'object') return '';
  return Object.entries(body)
    .map(([field, msgs]) => {
      const text = Array.isArray(msgs) ? msgs.join(' ') : typeof msgs === 'object' ? JSON.stringify(msgs) : String(msgs);
      return field === 'non_field_errors' ? text : `${field}: ${text}`;
    })
    .join('; ');
}
