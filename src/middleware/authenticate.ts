import type { NextFunction, Request, Response } from 'express';
import { verifyToken, COOKIE_NAME } from '../auth/jwt.js';
import * as users from '../repositories/users.js';
import { HttpError } from '../http-error.js';
import type { User } from '../domain.js';

/** Bearer header wins; when it is present the cookie is ignored entirely. */
function readToken(req: Request): string | undefined {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie: unknown = req.cookies?.[COOKIE_NAME];
  return typeof cookie === 'string' ? cookie : undefined;
}

/** Sets req.user when a valid token for an existing user is present. Never rejects by itself. */
export async function attachUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readToken(req);
  if (token) {
    try {
      const userId = await verifyToken(token);
      req.user = (await users.findById(userId)) ?? undefined; // deleted users lose access at once
    } catch {
      req.user = undefined; // expired / tampered token = logged out
    }
  }
  res.locals.user = req.user;
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new HttpError(401));
  next();
}

/** The signed-in user. Use on routes behind requireAuth; anywhere else it means "please log in". */
export function currentUser(req: Request): User {
  if (!req.user) throw new HttpError(401);
  return req.user;
}
