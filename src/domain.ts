// Domain vocabulary shared by validation, repositories, services and views.

export const ROLES = ['admin', 'member', 'viewer'] as const;
export const STATUSES = ['todo', 'in_progress', 'done'] as const;
export const PRIORITIES = ['high', 'medium', 'low'] as const;

export type Role = (typeof ROLES)[number];
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type BudgetStatus = 'on_track' | 'at_risk' | 'overrun';

declare const orgIdBrand: unique symbol;

/**
 * An organization id that has been VERIFIED for the current actor (see tenant-guard.ts).
 * A plain string from a URL or a request body is not an OrgId, so the compiler rejects passing
 * one to a tenant-scoped repository: the only way to get an OrgId is through loadMembership
 * (or the two documented cases where the membership is created in the same transaction).
 */
export type OrgId = string & { readonly [orgIdBrand]: true };

/** A signed-in user, as loaded by attachUser. Never includes the password hash. */
export interface User {
  id: string;
  email: string;
  name: string;
  created_at: Date;
}

/** Who performs a change: written into the activity log. */
export interface Actor {
  readonly orgId: OrgId;
  readonly userId: string;
  readonly actorName: string;
}

/** Trusted tenant context. Exists only after loadMembership found the user's membership row. */
export interface Tenant extends Actor {
  readonly orgName: string;
  readonly role: Role;
  readonly isAdmin: boolean;
  readonly canEdit: boolean;
  readonly isViewer: boolean;
}
