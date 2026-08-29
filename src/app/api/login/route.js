import { NextResponse } from 'next/server';

import { setAuthCookies } from '@/lib/auth';

/**
 * OAuth2 password-grant exchange against eq-auth.
 *
 * eq-auth's EmailTokenView gates axios-originated logins on the `Equilux-Origin`
 * header matching one of the user's roles, so we send `ADMIN` and a `User-Agent`
 * containing "axios" (mirrors the tiggie admin app's `Tiggie-Origin` pattern).
 * On success the tokens are stashed in httpOnly cookies; nothing sensitive is
 * returned to the browser.
 */
export async function POST(request) {
  const { email, password } = await request.json();

  const authUrl = process.env.EQ_AUTH_URL;
  const clientId = process.env.EQ_OAUTH_CLIENT_ID;
  const clientSecret = process.env.EQ_OAUTH_CLIENT_SECRET;

  if (!authUrl || !clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'serverMisconfigured', detail: 'eq-auth OAuth env vars are not set.' },
      { status: 500 },
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('email', email);
  params.append('password', password);

  try {
    const res = await fetch(`${authUrl}o/token/`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'axios',
        'Equilux-Origin': 'ADMIN',
      },
      body: params.toString(),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(data || { error: 'loginFailed' }, { status: res.status });
    }

    const user = {
      username: data.username,
      fullName: data.full_name,
      isSuperadmin: !!data.is_superadmin,
      roles: data.roles ?? [],
    };

    const response = NextResponse.json({ user });
    setAuthCookies(response, {
      access: data.access_token,
      refresh: data.refresh_token,
      user,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'authUnreachable', detail: String(error?.message ?? error) },
      { status: 502 },
    );
  }
}
