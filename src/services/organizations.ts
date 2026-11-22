import { withTx } from '../db.js';
import * as orgs from '../repositories/organizations.js';
import type { MyOrgRow, OrgRow } from '../repositories/organizations.js';
import * as memberships from '../repositories/memberships.js';
import type { MemberRow } from '../repositories/memberships.js';
import * as tasks from '../repositories/tasks.js';
import * as users from '../repositories/users.js';
import { verifiedOrgId } from '../repositories/tenant-guard.js';
import { ROLE_LABEL } from '../labels.js';
import { log, q } from './activity.js';
import { HttpError } from '../http-error.js';
import type { Role, Tenant, User } from '../domain.js';
import type { AddMemberInput, OrgInput, RoleInput } from '../validation.js';

// All tenant-scoped functions take `tenant` (tenantOf(req)): it only exists after loadMembership
// verified that the current user belongs to the org. Role checks happen in the routes.

export const listMine = (userId: string): Promise<MyOrgRow[]> => orgs.listForUser(userId);

export function create(user: User, { name }: OrgInput): Promise<OrgRow & { role: 'admin' }> {
  return withTx(async (client) => {
    const org = await orgs.createWithAdmin(client, { name, userId: user.id });
    // The creator was made the org's admin in the same transaction.
    const orgId = verifiedOrgId(org.id);
    await log(client, { orgId, userId: user.id, actorName: user.name }, {
      action: 'org.created', entityType: 'organization', entityId: org.id,
      summary: `created the organization ${q(name)}`,
    });
    return org;
  });
}

export function rename(tenant: Tenant, { name }: OrgInput): Promise<OrgRow | null> {
  return withTx(async (c) => {
    const org = await orgs.rename(tenant.orgId, name, c);
    if (tenant.orgName !== name) {
      await log(c, tenant, {
        action: 'org.renamed', entityType: 'organization', entityId: tenant.orgId,
        summary: `renamed the organization from ${q(tenant.orgName)} to ${q(name)}`,
      });
    }
    return org;
  });
}

export const listMembers = (tenant: Tenant): Promise<MemberRow[]> => memberships.list(tenant.orgId);

/** API only (the UI uses invite links): add an already-registered user by email. */
export function addMember(tenant: Tenant, { email, role }: AddMemberInput): Promise<{ user_id: string; name: string; email: string; role: Role }> {
  return withTx(async (c) => {
    const user = await users.findByEmail(email);
    if (!user) throw new HttpError(404, 'No registered user has that email. Ask them to register first.', { email: ['Not registered'] });
    if (await memberships.find(tenant.orgId, user.id, c)) {
      throw new HttpError(409, 'That user is already a member', { email: ['Already a member'] });
    }
    await memberships.add(tenant.orgId, user.id, role, c);
    await log(c, tenant, {
      action: 'member.added', entityType: 'member', entityId: user.id,
      summary: `added ${user.name} as ${ROLE_LABEL[role]}`,
    });
    return { user_id: user.id, name: user.name, email: user.email, role };
  });
}

/**
 * Role change and removal lock the org's membership rows first, so two concurrent requests
 * cannot both demote/remove "one of two" admins and leave the org with none.
 */
export function changeRole(tenant: Tenant, targetUserId: string, { role }: RoleInput): Promise<void> {
  return withTx(async (c) => {
    const rows = await memberships.lockAll(c, tenant.orgId);
    const target = rows.find((r) => r.user_id === targetUserId);
    if (!target) throw new HttpError(404, 'Member not found');
    if (target.role === role) return;
    const admins = rows.filter((r) => r.role === 'admin').length;
    if (target.role === 'admin' && admins === 1) {
      throw new HttpError(409, 'An organization must keep at least one admin');
    }
    await memberships.setRole(c, tenant.orgId, targetUserId, role);
    if (role === 'viewer') await tasks.unassignUser(tenant.orgId, targetUserId, c); // viewers can't hold tasks
    await log(c, tenant, {
      action: 'member.role_changed', entityType: 'member', entityId: targetUserId,
      summary: `changed ${target.name}'s role from ${ROLE_LABEL[target.role]} to ${ROLE_LABEL[role]}`,
    });
  });
}

export function removeMember(tenant: Tenant, targetUserId: string): Promise<void> {
  return withTx(async (c) => {
    const rows = await memberships.lockAll(c, tenant.orgId);
    const target = rows.find((r) => r.user_id === targetUserId);
    if (!target) throw new HttpError(404, 'Member not found');
    const admins = rows.filter((r) => r.role === 'admin').length;
    if (target.role === 'admin' && admins === 1) {
      throw new HttpError(409, 'An organization must keep at least one admin');
    }
    await memberships.remove(c, tenant.orgId, targetUserId); // assigned tasks are unassigned by the FK
    const self = targetUserId === tenant.userId;
    await log(c, tenant, {
      action: self ? 'member.left' : 'member.removed', entityType: 'member', entityId: targetUserId,
      summary: self ? 'left the organization' : `removed ${target.name} from the organization`,
    });
  });
}
