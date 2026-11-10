import { NextResponse } from 'next/server';

import { callWithSession, keepRotated, operatorHeaders, unreachableResponse } from '@/lib/session';

const NO_STORE = { 'Cache-Control': 'no-store, private' };

/**
 * One-time phone-login link for a user, shown as a QR code on the Users page.
 *
 * Two eq-auth calls, both server-side so the sudo token never reaches the
 * browser, and both carrying the operator's IP and browser for eq-auth's audit
 * log:
 *   1. `POST /api/auth/sudo/` re-checks the operator's password and returns a
 *      single-use sudo token (400 on a wrong password).
 *   2. `POST /api/users/<username>/phone_login_code/` with `X-Sudo-Token` returns
 *      `{ code, link, expires_in }` — SUPERADMIN only (404 for anyone else), 403
 *      for a refused sudo token, 400 for a user it won't sign in as.
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
  const operator = operatorHeaders(request);

  const sudo = await callWithSession(
    (token) =>
      fetch(`${authUrl}api/auth/sudo/`, {
        method: 'POST',
        headers: {
          ...operator,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
        cache: 'no-store',
      }),
    { unreachable: 'authUnreachable' },
  );
  if (sudo.error) return sudo.error;
  let rotated = sudo.rotated;
  const reply = (body, status) =>
    keepRotated(NextResponse.json(body, { status, headers: NO_STORE }), rotated);

  if (sudo.res.status === 400) return reply({ error: 'Wrong password.' }, 400);
  if (sudo.res.status === 429) return reply({ error: 'Too many attempts. Wait a minute.' }, 429);
  if (!sudo.res.ok) return reply({ error: 'Could not confirm your password.' }, 502);
  const sudoToken = (await sudo.res.json().catch(() => ({}))).sudo_token;
  if (!sudoToken) return reply({ error: 'Could not confirm your password.' }, 502);

  // Through callWithSession too: a 401 here is the session (eq-auth refuses a
  // bad sudo token with 403), so it refreshes and retries like any call. It
  // starts from the pair the sudo call left current, not the request's cookies.
  const code = await callWithSession(
    (token) =>
      fetch(`${authUrl}api/users/${encodeURIComponent(username)}/phone_login_code/`, {
        method: 'POST',
        headers: {
          ...operator,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'X-Sudo-Token': sudoToken,
        },
        cache: 'no-store',
      }),
    { unreachable: 'authUnreachable', session: sudo.session },
  );
  rotated = code.rotated ?? rotated;
  if (code.error) {
    // A dead session clears the cookies; don't write tokens back over that.
    return code.error.status === 401 ? code.error : keepRotated(code.error, rotated);
  }

  let data;
  try {
    data = await code.res.json();
  } catch (error) {
    return unreachableResponse('authUnreachable', error, rotated);
  }
  if (code.res.status === 404) {
    return reply({ error: 'Phone login is not available for this user.' }, 404);
  }
  if (code.res.status === 403) {
    return reply({ error: 'Could not confirm your password. Try again.' }, 403);
  }
  if (!code.res.ok) {
    return reply({ error: data?.detail || 'Could not create a phone login.' }, code.res.status);
  }
  return reply({ link: data.link, expiresIn: data.expires_in }, 200);
}
