import type { OrgId } from '../domain.js';

/**
 * Every tenant-scoped repository function takes an OrgId as its FIRST argument and calls this.
 * The type already rules out an unverified string at compile time; this is the runtime backstop:
 * a missing orgId is a programming error, so fail closed instead of running an unscoped query.
 */
export function assertOrg(orgId: OrgId): void {
  if (typeof orgId !== 'string' || orgId.length === 0) {
    throw new Error('BUG: tenant-scoped query called without an orgId');
  }
}

/**
 * Turns an org id into a trusted OrgId. Only call this where membership has been VERIFIED:
 *   - loadMembership, after finding the (org, user) membership row      (every request)
 *   - organization creation, where the creator becomes its admin        (same transaction)
 *   - invite acceptance, where the single-use token creates the membership (same transaction)
 * `grep verifiedOrgId src` lists every call; anything else is a review red flag.
 */
export function verifiedOrgId(id: string): OrgId {
  return id as OrgId;
}
