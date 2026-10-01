import { NextResponse } from 'next/server';

import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth';

/**
 * Gate `/dashboard` behind a session cookie; bounce authenticated users away
 * from `/login`. A session counts as present when *either* the access or the
 * refresh cookie is set — an expired access token with a live refresh token
 * still keeps the operator in, and the hub proxy refreshes it on the next call.
 * Token validity itself is enforced at eq-auth (login + refresh); this only
 * checks presence.
 */
export function middleware(request) {
  const { pathname } = request.nextUrl;
  const hasToken =
    Boolean(request.cookies.get(ACCESS_COOKIE)?.value) ||
    Boolean(request.cookies.get(REFRESH_COOKIE)?.value);

  if (pathname.startsWith('/dashboard') && !hasToken) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (pathname === '/login' && hasToken) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
