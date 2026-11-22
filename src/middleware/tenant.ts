import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import * as memberships from '../repositories/memberships.js';
import { verifiedOrgId } from '../repositories/tenant-guard.js';
import { HttpError } from '../http-error.js';
import { currentUser } from './authenticate.js';
import type { Tenant } from '../domain.js';

const orgIdSchema = z.uuid();

/**
 * THE tenant boundary. Every /orgs/:orgId/... route runs this after requireAuth.
 *
 * The orgId in the URL is only a selector. It becomes trusted tenant context (a branded OrgId)
 * only once a membership row for (orgId, current user) is found in the database. No row -> 404,
 * so an outsider cannot even tell whether the organization exists.
 *
 * Handlers must read the org from tenantOf(req) only, never from req.params or req.body.
 */
export async function loadMembership(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const parsed = orgIdSchema.safeParse(req.params.orgId);
  if (!parsed.success) throw new HttpError(404);

  const user = currentUser(req);
  const membership = await memberships.find(parsed.data, user.id);
  if (!membership) throw new HttpError(404);

  req.tenant = Object.freeze({
    orgId: verifiedOrgId(parsed.data), // the ONE place a request's org id becomes trusted
    orgName: membership.org_name,
    userId: user.id,
    actorName: user.name,
    role: membership.role,
    isAdmin: membership.role === 'admin',
    canEdit: membership.role === 'admin' || membership.role === 'member', // viewers are read-only
    isViewer: membership.role === 'viewer',
  });
  next();
}

/** The verified tenant of this request. Throws if a route forgot loadMembership (fail closed). */
export function tenantOf(req: Request): Tenant {
  if (!req.tenant) throw new Error('BUG: tenant route is missing loadMembership');
  return req.tenant;
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.tenant?.role !== 'admin') return next(new HttpError(403, 'Only organization admins can do that'));
  next();
}

/** Admins and members may change tasks; viewers may only read. */
export function requireEditor(req: Request, _res: Response, next: NextFunction): void {
  if (!req.tenant?.canEdit) return next(new HttpError(403, 'Viewers have read-only access'));
  next();
}
