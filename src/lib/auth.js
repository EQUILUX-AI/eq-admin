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

/** Write auth cookies onto a NextResponse after a successful token exchange. */
export function setAuthCookies(response, { access, refresh, user }) {
  // Access token lifetime tracks eq-auth's; 8h is a safe upper bound for a cookie.
  response.cookies.set(ACCESS_COOKIE, access, { ...baseCookie, maxAge: 60 * 60 * 8 });
  if (refresh) {
    response.cookies.set(REFRESH_COOKIE, refresh, {
      ...baseCookie,
      maxAge: 60 * 60 * 24 * 14,
    });
  }
  // Readable by the client so the header can greet the operator.
  response.cookies.set(USER_COOKIE, encodeURIComponent(JSON.stringify(user ?? {})), {
    ...baseCookie,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 14,
  });
}

/** Clear every auth cookie (logout / failed refresh). */
export function clearAuthCookies(response) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, USER_COOKIE]) {
    response.cookies.set(name, '', { ...baseCookie, httpOnly: false, maxAge: 0 });
  }
}
