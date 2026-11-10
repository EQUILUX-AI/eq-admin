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

/** Persist tokens a refresh rotated onto the outgoing response. */
export function keepRotated(out, rotated) {
  if (rotated?.access) {
    setAuthCookies(out, { access: rotated.access, refresh: rotated.refresh });
  }
  return out;
}

/** A 502 for an unreachable upstream that still keeps rotated tokens. */
export function unreachableResponse(code, error, rotated) {
  const out = NextResponse.json(
    { error: code, detail: String(error?.message ?? error) },
    { status: 502 },
  );
  return keepRotated(out, rotated);
}

/**
 * Call upstream with the operator's access token. On a 401 (expired/revoked),
 * transparently exchange the refresh token for a new one and retry once.
 *
 * `call(token)` returns a fetch Response. Resolves to
 * `{ res, session, rotated }` — `session` is the `{ access, refresh }` pair now
 * current, for a follow-up call in the same request (pass it back as
 * `session`: the request's cookies still hold the old pair) — or to
 * `{ error, rotated }`, `error` being a ready NextResponse: a 401 that also
 * clears a dead session so the client bounces the operator to /login, or a 502
 * (`unreachable`) when the upstream can't be reached. Every error response
 * keeps tokens a refresh already rotated: the old refresh token is spent, so
 * dropping them would log the operator out once eq-auth's grace period ends.
 */
export async function callWithSession(
  call,
  { unreachable = 'upstreamUnreachable', session = null } = {},
) {
  let access = session?.access;
  let refresh = session?.refresh;
  if (!session) {
    const store = await cookies();
    access = store.get(ACCESS_COOKIE)?.value;
    refresh = store.get(REFRESH_COOKIE)?.value;
  }
  if (!access && !refresh) {
    return { error: NextResponse.json({ error: 'notAuthenticated' }, { status: 401 }) };
  }

  let res = null;
  let rotated = null;
  try {
    res = access ? await call(access) : null;
    if ((!res || res.status === 401) && refresh) {
      rotated = await refreshOnce(refresh);
      if (rotated?.access) {
        res = await call(rotated.access);
      }
    }
  } catch (error) {
    return { error: unreachableResponse(unreachable, error, rotated), rotated };
  }

  // No usable session (no access and refresh failed, or refresh still 401s).
  if (!res || res.status === 401) {
    const out = NextResponse.json({ error: 'sessionExpired' }, { status: 401 });
    clearAuthCookies(out);
    return { error: out, rotated: null };
  }
  const current = rotated?.access ? rotated : { access, refresh };
  return { res, session: current, rotated };
}

/**
 * Relay an upstream response from `callWithSession` as-is (status, body,
 * Content-Type; a 204 stays empty), keeping rotated tokens.
 */
export async function passThrough({ res, rotated }, unreachable) {
  try {
    const body = await res.text();
    const out = new NextResponse(res.status === 204 ? null : body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
    return keepRotated(out, rotated);
  } catch (error) {
    return unreachableResponse(unreachable, error, rotated);
  }
}

/**
 * The operator's IP and browser, to pass to eq-auth on audited calls, so its
 * audit log records them rather than this server. eq-auth takes the first
 * `X-Forwarded-For` hop; the proxies in front of it append after ours.
 */
export function operatorHeaders(request) {
  const ip =
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '';
  const userAgent = request.headers.get('user-agent') ?? '';
  return {
    ...(ip ? { 'X-Forwarded-For': ip } : {}),
    ...(userAgent ? { 'User-Agent': userAgent } : {}),
  };
}
