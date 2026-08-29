import { NextResponse } from 'next/server';

import { ACCESS_COOKIE } from '@/lib/auth';

/**
 * Gate `/dashboard` behind an access cookie; bounce authenticated users away
 * from `/login`. Token validity is enforced at eq-auth on login — this only
 * checks presence, which is enough for a first version.
 */
export function middleware(request) {
  const { pathname } = request.nextUrl;
  const hasToken = Boolean(request.cookies.get(ACCESS_COOKIE)?.value);

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
