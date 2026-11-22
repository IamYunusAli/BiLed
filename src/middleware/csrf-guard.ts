import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../http-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection without tokens (OWASP CSRF Prevention Cheat Sheet):
 *  1. Fetch Metadata: browsers send Sec-Fetch-Site. Reject state-changing requests that are cross-site.
 *  2. Fallback for older browsers: the Origin header must equal our own origin. "null" is never trusted.
 *  3. Requests authenticated with an Authorization header cannot be forged cross-site (no ambient
 *     credentials), and clients with neither header are not browsers.
 * Layered with SameSite=Lax on the auth cookie, and with the rule that GET routes never change data.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('authorization')?.startsWith('Bearer ')) return next();

  const blocked = () => next(new HttpError(403, 'Cross-site request blocked'));

  const site = req.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none' ? next() : blocked();

  const origin = req.get('origin');
  if (origin === 'null') return blocked();
  if (origin) {
    const expected = `${req.protocol}://${req.get('host')}`; // trust proxy => https on Render
    return origin === expected ? next() : blocked();
  }
  return next();
}
