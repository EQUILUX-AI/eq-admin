/**
 * Auth cookie helpers, shared by the login/logout/proxy routes.
 *
 * The access + refresh tokens live in httpOnly cookies so the browser JS never
 * touches them; a separate non-httpOnly `eq_user` cookie carries the display
 * name for the UI. Route protection is by presence of the access cookie (see
 * middleware.js).
 */
export const ACCESS_COOKIE = 'eq_access';
export const REFRESH_COOKIE = 'eq_refresh';
export const USER_COOKIE = 'eq_user';

const isProd = process.env.NODE_ENV === 'production';

const baseCookie = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  path: '/',
};

/**
 * Write auth cookies onto a NextResponse after a token exchange.
 *
 * `user` is optional: a login passes all three, a silent refresh passes only the
 * rotated `access`/`refresh` and leaves the existing `eq_user` cookie untouched.
 */
export function setAuthCookies(response, { access, refresh, user }) {
  // Access token lifetime tracks eq-auth's; 8h is a safe upper bound for a cookie.
  if (access) {
    response.cookies.set(ACCESS_COOKIE, access, { ...baseCookie, maxAge: 60 * 60 * 8 });
  }
  if (refresh) {
    response.cookies.set(REFRESH_COOKIE, refresh, {
      ...baseCookie,
      maxAge: 60 * 60 * 24 * 14,
    });
  }
  // Readable by the client so the header can greet the operator.
  if (user !== undefined) {
    response.cookies.set(USER_COOKIE, encodeURIComponent(JSON.stringify(user ?? {})), {
      ...baseCookie,
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 14,
    });
  }
}

/**
 * Exchange a refresh token for a fresh access (+ rotated refresh) token at
 * eq-auth. Returns `{ access, refresh }` on success, or `null` if the refresh
 * token is missing/expired/rejected — the caller should then clear the session.
 */
export async function refreshAccessToken(refreshToken) {
  const authUrl = process.env.EQ_AUTH_URL;
  const clientId = process.env.EQ_OAUTH_CLIENT_ID;
  const clientSecret = process.env.EQ_OAUTH_CLIENT_SECRET;
  if (!authUrl || !clientId || !clientSecret || !refreshToken) return null;

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);

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
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (!data.access_token) return null;
    // OAuth2 rotation usually returns a new refresh token; fall back to the old
    // one if the provider chose not to rotate.
    return { access: data.access_token, refresh: data.refresh_token || refreshToken };
  } catch {
    return null;
  }
}

/** Clear every auth cookie (logout / failed refresh). */
export function clearAuthCookies(response) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, USER_COOKIE]) {
    response.cookies.set(name, '', { ...baseCookie, httpOnly: false, maxAge: 0 });
  }
}
