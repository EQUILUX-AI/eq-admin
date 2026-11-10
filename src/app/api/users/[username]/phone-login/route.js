import { NextResponse } from 'next/server';

import { callWithSession, keepRotated } from '@/lib/session';

const NO_STORE = { 'Cache-Control': 'no-store, private' };

/**
 * One-time phone-login link for a user, shown as a QR code on the Users page.
 *
 * Two eq-auth calls, both server-side so the sudo token never reaches the
 * browser:
 *   1. `POST /api/auth/sudo/` re-checks the operator's password and returns a
 *      single-use sudo token (400 on a wrong password).
 *   2. `POST /api/users/<username>/phone_login_code/` with `X-Sudo-Token` returns
 *      `{ code, link, expires_in }` — SUPERADMIN only (404 for anyone else).
 *
 * Responds `{ link, expiresIn }`.
 */
export async function POST(request, { params }) {
  const authUrl = process.env.EQ_AUTH_URL;
  if (!authUrl) {
    return NextResponse.json({ error: 'serverMisconfigured' }, { status: 500 });
  }

  const { username } = await params;
  const { password } = await request.json().catch(() => ({}));
  if (!password) {
    return NextResponse.json({ error: 'Enter your password.' }, { status: 400 });
  }

  try {
    const sudo = await callWithSession((token) =>
      fetch(`${authUrl}api/auth/sudo/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
        cache: 'no-store',
      }),
    );
    if (sudo.error) return sudo.error;

    const reply = (body, status) =>
      keepRotated(NextResponse.json(body, { status, headers: NO_STORE }), sudo.rotated);

    if (sudo.res.status === 400) return reply({ error: 'Wrong password.' }, 400);
    if (sudo.res.status === 429) return reply({ error: 'Too many attempts. Wait a minute.' }, 429);
    if (!sudo.res.ok) return reply({ error: 'Could not confirm your password.' }, 502);
    const { sudo_token: sudoToken } = await sudo.res.json();

    const res = await fetch(
      `${authUrl}api/users/${encodeURIComponent(username)}/phone_login_code/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sudo.token}`,
          Accept: 'application/json',
          'X-Sudo-Token': sudoToken,
        },
        cache: 'no-store',
      },
    );
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) {
      return reply({ error: 'Phone login is not available for this user.' }, 404);
    }
    // A 401 here is the sudo token being refused, not a dead session; don't pass
    // it on, or the page would treat it as one and bounce to /login.
    if (res.status === 401) return reply({ error: 'Could not confirm your password. Try again.' }, 502);
    if (!res.ok) {
      return reply({ error: data.detail || 'Could not create a phone login.' }, res.status);
    }
    return reply({ link: data.link, expiresIn: data.expires_in }, 200);
  } catch (error) {
    return NextResponse.json(
      { error: 'authUnreachable', detail: String(error?.message ?? error) },
      { status: 502 },
    );
  }
}
