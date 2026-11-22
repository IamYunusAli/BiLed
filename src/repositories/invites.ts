import { defaultDb, query, type Db } from '../db.js';
import type { OrgId, Role } from '../domain.js';
import { assertOrg } from './tenant-guard.js';

const ACTIVE = `used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`;

export interface CreatedInvite {
  id: string;
  role: Role;
  created_at: Date;
  expires_at: Date;
}

export interface PendingInvite extends CreatedInvite {
  created_by: string | null;
  created_by_name: string | null;
}

export interface ActiveInvite {
  id: string;
  org_id: string;
  role: Role;
  expires_at: Date;
  org_name: string;
  inviter_name: string | null;
}

export async function create(
  orgId: OrgId,
  { tokenHash, role, createdBy, expiresAt }: { tokenHash: string; role: Role; createdBy: string; expiresAt: Date },
  db: Db = defaultDb,
): Promise<CreatedInvite> {
  assertOrg(orgId);
  const { rows } = await db.query<CreatedInvite>(
    `INSERT INTO invites (org_id, token_hash, role, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, role, created_at, expires_at`,
    [orgId, tokenHash, role, createdBy, expiresAt],
  );
  return rows[0]!;
}

/** Pending (usable) invites of one org, newest first. */
export async function listPending(orgId: OrgId): Promise<PendingInvite[]> {
  assertOrg(orgId);
  const { rows } = await query<PendingInvite>(
    `SELECT i.id, i.role, i.created_at, i.expires_at, i.created_by, u.name AS created_by_name
       FROM invites i LEFT JOIN users u ON u.id = i.created_by
      WHERE i.org_id = $1 AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
      ORDER BY i.created_at DESC`,
    [orgId],
  );
  return rows;
}

export async function countCreated(orgId: OrgId): Promise<number> {
  assertOrg(orgId);
  const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM invites WHERE org_id = $1`, [orgId]);
  return rows[0]?.n ?? 0;
}

/** Revokes a pending invite of THIS org only. Returns the revoked invite's role, or null. */
export async function revoke(orgId: OrgId, inviteId: string, db: Db = defaultDb): Promise<{ role: Role } | null> {
  assertOrg(orgId);
  const { rows } = await db.query<{ role: Role }>(
    `UPDATE invites SET revoked_at = now() WHERE org_id = $1 AND id = $2 AND ${ACTIVE} RETURNING role`,
    [orgId, inviteId],
  );
  return rows[0] ?? null;
}

/**
 * Looks up a usable invite by the hash of the token from the link. The token itself is the
 * credential here (the holder is not a member yet), so this is the one lookup not scoped by a
 * membership; it only ever returns the single org the link was made for.
 */
export async function findActiveByHash(tokenHash: string): Promise<ActiveInvite | null> {
  const { rows } = await query<ActiveInvite>(
    `SELECT i.id, i.org_id, i.role, i.expires_at, o.name AS org_name, u.name AS inviter_name
       FROM invites i
       JOIN organizations o ON o.id = i.org_id
       LEFT JOIN users u ON u.id = i.created_by
      WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/** Atomically marks the invite used. Requires a transaction client. Returns null if already used. */
export async function consume(client: Db, inviteId: string, userId: string): Promise<{ org_id: string; role: Role } | null> {
  const { rows } = await client.query<{ org_id: string; role: Role }>(
    `UPDATE invites SET used_at = now(), used_by = $2
      WHERE id = $1 AND ${ACTIVE}
      RETURNING org_id, role`,
    [inviteId, userId],
  );
  return rows[0] ?? null;
}
