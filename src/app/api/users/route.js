import { NextResponse } from 'next/server';

import { callWithSession, keepRotated } from '@/lib/session';

// Query params passed on to eq-auth's user list; anything else is dropped.
const PASSED_PARAMS = ['search', 'page', 'page_size'];

/**
 * User list from eq-auth (`GET /api/users/`), for the Users page.
 *
 * eq-auth lists users only to admins and hides SUPERADMIN members from anyone
 * else; its response is `{ count, results }`.
 */
export async function GET(request) {
  const authUrl = process.env.EQ_AUTH_URL;
  if (!authUrl) {
    return NextResponse.json({ error: 'serverMisconfigured' }, { status: 500 });
  }

  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of PASSED_PARAMS) {
    const value = incoming.get(key);
    if (value) query.set(key, value);
  }

  try {
    const { res, rotated, error } = await callWithSession((token) =>
      fetch(`${authUrl}api/users/?${query}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
      }),
    );
    if (error) return error;

    const out = new NextResponse(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
    return keepRotated(out, rotated);
  } catch (error) {
    return NextResponse.json(
      { error: 'authUnreachable', detail: String(error?.message ?? error) },
      { status: 502 },
    );
  }
}
