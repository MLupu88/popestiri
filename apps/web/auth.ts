import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

export const cookieName = 'popestiri_session';
const ttl = 8 * 60 * 60;
export function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}
export function createSession(secret: string, now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + ttl}.${randomBytes(24).toString('base64url')}`;
  return `${payload}.${sign(payload, secret)}`;
}
export function validSession(value: string, secret: string, now = Date.now()) {
  const parts = value.split('.');
  if(parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
  const expiry = Number(parts[0]);
  return expiry > now / 1000 && expiry <= now / 1000 + ttl && equal(parts[2], sign(`${parts[0]}.${parts[1]}`, secret));
}
export function sessionCookie(value: string, production: boolean) {
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value ? ttl : 0}${production ? '; Secure' : ''}`;
}
export function readSession(header: string | undefined) {
  return header?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? '';
}
export function csrfToken(session: string, secret: string) {return sign(`csrf:${session}`, secret);}
