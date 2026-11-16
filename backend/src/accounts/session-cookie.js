export const SESSION_COOKIE_NAME = 'mictlan_session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function readSessionCookie(request) {
  const cookie = request.headers?.cookie;
  if (typeof cookie !== 'string') return undefined;
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const entry = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return entry?.slice(prefix.length);
}

export function createSessionCookie(token, secure) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${token ? SESSION_MAX_AGE_SECONDS : 0}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
