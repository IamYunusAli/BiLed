import { SignJWT, jwtVerify } from 'jose';
import type { CookieOptions } from 'express';
import { config } from '../config.js';

const ISSUER = 'daps-tracker';
const AUDIENCE = 'daps-tracker';
const TTL_SECONDS = 8 * 60 * 60;

export const COOKIE_NAME = 'token';

/**
 * The token carries ONLY the user id. Organization ids and roles are deliberately not in the
 * token: they are read from the memberships table on every request, so removing a member or
 * changing a role takes effect immediately.
 */
export function signToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(config.jwtSecret);
}

/** Returns the user id, or throws if the token is invalid/expired. Only HS256 is accepted. */
export async function verifyToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, config.jwtSecret, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (!payload.sub) throw new Error('token has no subject');
  return payload.sub;
}

export function cookieOptions(): CookieOptions & { maxAge: number } {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS * 1000,
  };
}
