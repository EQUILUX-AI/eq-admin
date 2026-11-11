import { USER_COOKIE } from '@/lib/auth';

/**
 * The signed-in operator from the readable user cookie (set at login:
 * `{ username, fullName, isSuperadmin, roles }`), or null. Display/UI gating
 * only — eq-auth enforces every privilege itself.
 */
export function readUserCookie() {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${USER_COOKIE}=`));
  if (!match) return null;
  return parseUserCookie(match.split('=').slice(1).join('='));
}

/**
 * The cookie's value as `{ username, fullName, isSuperadmin, roles }`, or null.
 * Next.js URL-encodes it once; sessions signed in before that fix hold it
 * encoded twice (setAuthCookies encoded it too), so it is decoded until it
 * parses, at most twice.
 */
export function parseUserCookie(value) {
  let text = value;
  for (let i = 0; i < 2; i++) {
    try {
      text = decodeURIComponent(text);
      return JSON.parse(text);
    } catch {
      // Still encoded (or not JSON): try one more decode.
    }
  }
  return null;
}
