import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  refreshAccessToken,
  setAuthCookies,
} from '@/lib/auth';

/**
 * Coalesce concurrent refreshes. The dashboard fires several queries at once, so
 * on a stale access token they'd each try to redeem the same rotating, single-use
 * refresh token — all but the first would get an invalidated token back and
 * wrongly clear the session. Share one in-flight refresh per token within this
 * server process (the proxy-side equivalent of tiggie's `isRefreshing` guard).
 * Every route that calls upstream with the operator's token goes through here,
 * so eq-hub and eq-auth calls share the same refresh.
 */
const inflightRefreshes = new Map();
function refreshOnce(refreshToken) {
  let pending = inflightRefreshes.get(refreshToken);
  if (!pending) {
    pending = refreshAccessToken(refreshToken).finally(() =>
      inflightRefreshes.delete(refreshToken),
    );
    inflightRefreshes.set(refreshToken, pending);
  }
  return pending;
}

/**
 * Call upstream with the operator's access token. On a 401 (expired/revoked),
 * transparently exchange the refresh token for a new one and retry once.
 *
 * `call(token)` returns a fetch Response. Resolves to `{ res, token, rotated }`
 * (`token` is the access token that worked, for follow-up calls), or
 * `{ error }` — a ready 401 NextResponse that also clears a dead session so the
 * client bounces the operator to /login. Network errors propagate.
 */
export async function callWithSession(call) {
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  const refresh = store.get(REFRESH_COOKIE)?.value;
  if (!access && !refresh) {
    return { error: NextResponse.json({ error: 'notAuthenticated' }, { status: 401 }) };
  }

  let res = access ? await call(access) : null;
  let rotated = null;
  if ((!res || res.status === 401) && refresh) {
    rotated = await refreshOnce(refresh);
    if (rotated?.access) {
      res = await call(rotated.access);
    }
  }

  // No usable session (no access and refresh failed, or refresh still 401s).
  if (!res || res.status === 401) {
    const out = NextResponse.json({ error: 'sessionExpired' }, { status: 401 });
    clearAuthCookies(out);
    return { error: out };
  }
  return { res, token: rotated?.access ?? access, rotated };
}

/** Persist tokens a refresh rotated onto the outgoing response. */
export function keepRotated(out, rotated) {
  if (rotated?.access) {
    setAuthCookies(out, { access: rotated.access, refresh: rotated.refresh });
  }
  return out;
}
