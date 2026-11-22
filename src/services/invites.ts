import { createHash, randomBytes } from 'node:crypto';
import { withTx } from '../db.js';
import * as invites from '../repositories/invites.js';
import type { ActiveInvite, CreatedInvite, PendingInvite } from '../repositories/invites.js';
import * as memberships from '../repositories/memberships.js';
import { verifiedOrgId } from '../repositories/tenant-guard.js';
import { ROLE_LABEL } from '../labels.js';
import { log } from './activity.js';
import { HttpError } from '../http-error.js';
import type { Role, Tenant, User } from '../domain.js';

const VALID_DAYS = 7;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Tokens are 32 random bytes (base64url). Anything else can't be a token: skip the DB lookup. */
const looksLikeToken = (token: unknown): token is string => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

export type JoinResult = { orgId: string; alreadyMember: true } | { orgId: string; role: Role; alreadyMember: false };

/**
 * Creates a single-use invite for the tenant's org. The plain token is returned ONCE (to show
 * to the admin) and never stored; only its hash is.
 */
export function create(tenant: Tenant, { role }: { role: Role }): Promise<CreatedInvite & { token: string }> {
  return withTx(async (c) => {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000);
    const invite = await invites.create(tenant.orgId, { tokenHash: hashToken(token), role, createdBy: tenant.userId, expiresAt }, c);
    await log(c, tenant, {
      action: 'invite.created', entityType: 'invite', entityId: invite.id,
      summary: `created a ${ROLE_LABEL[role]} invite link`,
    });
    return { ...invite, token };
  });
}

export const listPending = (tenant: Tenant): Promise<PendingInvite[]> => invites.listPending(tenant.orgId);
export const countCreated = (tenant: Tenant): Promise<number> => invites.countCreated(tenant.orgId);

export function revoke(tenant: Tenant, inviteId: string): Promise<void> {
  return withTx(async (c) => {
    const revoked = await invites.revoke(tenant.orgId, inviteId, c);
    if (!revoked) throw new HttpError(404, 'Invite not found or already used');
    await log(c, tenant, {
      action: 'invite.revoked', entityType: 'invite', entityId: inviteId,
      summary: `revoked a ${ROLE_LABEL[revoked.role]} invite link`,
    });
  });
}

/** The invite behind a link, or null when the link is unknown, used, revoked or expired. */
export async function lookup(token: unknown): Promise<ActiveInvite | null> {
  if (!looksLikeToken(token)) return null;
  return invites.findActiveByHash(hashToken(token));
}

/**
 * Joins the org the link was made for. If the user is already a member the link is left unused
 * (it may be meant for someone else) and they are simply sent to the org.
 */
export async function accept(token: unknown, user: User): Promise<JoinResult> {
  const invite = await lookup(token);
  if (!invite) throw new HttpError(404, 'This invite link is invalid or has expired');
  if (await memberships.find(invite.org_id, user.id)) return { orgId: invite.org_id, alreadyMember: true };

  return withTx(async (client): Promise<JoinResult> => {
    const used = await invites.consume(client, invite.id, user.id); // single use, race-safe
    if (!used) throw new HttpError(404, 'This invite link is invalid or has expired');
    await client.query(
      `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (org_id, user_id) DO NOTHING`,
      [used.org_id, user.id, used.role],
    );
    // The single-use token is the credential and the membership was created just above.
    const orgId = verifiedOrgId(used.org_id);
    await log(client, { orgId, userId: user.id, actorName: user.name }, {
      action: 'member.joined', entityType: 'member', entityId: user.id,
      summary: `joined as ${ROLE_LABEL[used.role]} via an invite link${invite.inviter_name ? ` from ${invite.inviter_name}` : ''}`,
    });
    return { orgId, role: used.role, alreadyMember: false };
  });
}
