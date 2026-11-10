import { NextResponse } from 'next/server';

import { callWithSession, passThrough } from '@/lib/session';

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

  const result = await callWithSession(
    (token) =>
      fetch(`${authUrl}api/users/?${query}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
      }),
    { unreachable: 'authUnreachable' },
  );
  if (result.error) return result.error;
  return passThrough(result, 'authUnreachable');
}
