import { USER_COOKIE } from '@/lib/auth';

/**
 * The signed-in operator from the readable user cookie (set at login:
 * `{ username, fullName, isSuperadmin, roles }`), or null. Display/UI gating
 * only — eq-auth enforces every privilege itself.
 */
export function readUserCookie() {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${USER_COOKIE}=`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')));
  } catch {
    return null;
  }
}
