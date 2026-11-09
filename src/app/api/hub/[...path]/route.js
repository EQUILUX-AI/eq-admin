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
 * Server-side proxy to eq-hub's `/api/*` surface.
 *
 * Keeps the browser on one origin (no CORS) and the access token in an httpOnly
 * cookie (never exposed to page JS). eq-hub authenticates the bearer (OAuth2
 * introspection at eq-auth) and scopes every read to a home the caller may see
 * (admins all, end-users their own), then proxies stats to eq-ai — so eq-ai is
 * never reached directly and the same authorization applies to this admin app
 * and the mobile app alike.
 *
 * `/api/hub/stats/<home>/weekly-summary?...` → `${EQ_HUB_URL}/api/stats/<home>/weekly-summary/?...`
 */

/**
 * Coalesce concurrent refreshes. The dashboard fires several queries at once, so
 * on a stale access token they'd each try to redeem the same rotating, single-use
 * refresh token — all but the first would get an invalidated token back and
 * wrongly clear the session. Share one in-flight refresh per token within this
 * server process (the proxy-side equivalent of tiggie's `isRefreshing` guard).
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
 * Shared proxy handler. GET forwards with no body; POST/PATCH/DELETE forward the
 * request's JSON body as-is (eq-hub validates it). A 204 passes through empty.
 */
async function proxy(request, { params }) {
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  const refresh = store.get(REFRESH_COOKIE)?.value;
  if (!access && !refresh) {
    return NextResponse.json({ error: 'notAuthenticated' }, { status: 401 });
  }

  const { path } = await params;
  const base = process.env.EQ_HUB_URL;
  if (!base) {
    return NextResponse.json({ error: 'serverMisconfigured' }, { status: 500 });
  }

  const search = new URL(request.url).search;
  // eq-hub is DRF with APPEND_SLASH — end the path in a slash so the GET isn't
  // 301-redirected (a redirect would drop the Authorization header).
  const target = `${base.replace(/\/$/, '')}/api/${path.join('/')}/${search}`;
  const method = request.method;
  // Read the body once up front — a refresh-and-retry re-sends the same payload.
  const payload = method === 'GET' ? undefined : (await request.text()) || undefined;
  const callHub = (token) =>
    fetch(target, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
      },
      body: payload,
      cache: 'no-store',
    });

  try {
    // Try the current access token; on a 401 (expired/revoked), transparently
    // exchange the refresh token for a new one and retry once. `rotated` carries
    // the fresh tokens so we can persist them onto the response.
    let res = access ? await callHub(access) : null;
    let rotated = null;
    if ((!res || res.status === 401) && refresh) {
      rotated = await refreshOnce(refresh);
      if (rotated?.access) {
        res = await callHub(rotated.access);
      }
    }

    // No usable session (no access and refresh failed, or refresh still 401s):
    // clear cookies so the client bounces the operator to /login.
    if (!res || res.status === 401) {
      const out = NextResponse.json({ error: 'sessionExpired' }, { status: 401 });
      clearAuthCookies(out);
      return out;
    }

    const body = await res.text();
    const out = new NextResponse(res.status === 204 ? null : body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
    if (rotated?.access) {
      setAuthCookies(out, { access: rotated.access, refresh: rotated.refresh });
    }
    return out;
  } catch (error) {
    return NextResponse.json(
      { error: 'eqHubUnreachable', detail: String(error?.message ?? error) },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
