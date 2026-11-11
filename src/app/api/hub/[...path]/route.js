import { NextResponse } from 'next/server';

import { callWithSession, passThrough } from '@/lib/session';

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
 * Shared proxy handler. GET forwards with no body; POST/PATCH/DELETE forward the
 * request's JSON body as-is (eq-hub validates it). A 204 passes through empty.
 */
async function proxy(request, { params }) {
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

  // Refreshes and retries once on a 401; a dead session or an unreachable
  // eq-hub comes back as `error`.
  const result = await callWithSession(callHub, { unreachable: 'eqHubUnreachable' });
  if (result.error) return result.error;
  return passThrough(result, 'eqHubUnreachable');
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
