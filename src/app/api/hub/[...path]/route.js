import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACCESS_COOKIE } from '@/lib/auth';

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
export async function GET(request, { params }) {
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  if (!access) {
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

  try {
    const res = await fetch(target, {
      headers: { Authorization: `Bearer ${access}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'eqHubUnreachable', detail: String(error?.message ?? error) },
      { status: 502 },
    );
  }
}
