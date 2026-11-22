import { defaultDb, query, type Db } from '../db.js';
import type { OrgId, Role } from '../domain.js';
import { assertOrg } from './tenant-guard.js';

export interface MembershipRow {
  role: Role;
  org_name: string;
  user_name: string;
}

export interface MemberRow {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  created_at: Date;
}

export interface LockedMember {
  user_id: string;
  role: Role;
  name: string;
}

/**
 * The membership check behind every org-scoped request. It takes a plain string because it IS
 * the verification: loadMembership turns the id into an OrgId only when this returns a row.
 */
export async function find(orgId: string, userId: string, db: Db = defaultDb): Promise<MembershipRow | null> {
  if (typeof orgId !== 'string' || orgId.length === 0) throw new Error('BUG: membership check without an orgId');
  const { rows } = await db.query<MembershipRow>(
    `SELECT m.role, o.name AS org_name, u.name AS user_name
       FROM memberships m
       JOIN organizations o ON o.id = m.org_id
       JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1 AND m.user_id = $2`,
    [orgId, userId],
  );
  return rows[0] ?? null;
}

const ROLE_ORDER = `CASE m.role WHEN 'admin' THEN 0 WHEN 'member' THEN 1 ELSE 2 END`;

export async function list(orgId: OrgId): Promise<MemberRow[]> {
  assertOrg(orgId);
  const { rows } = await query<MemberRow>(
    `SELECT u.id AS user_id, u.name, u.email, m.role, m.created_at
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1
      ORDER BY ${ROLE_ORDER}, u.name`,
    [orgId],
  );
  return rows;
}

export async function add(orgId: OrgId, userId: string, role: Role, db: Db = defaultDb): Promise<{ org_id: string; user_id: string; role: Role }> {
  assertOrg(orgId);
  const { rows } = await db.query<{ org_id: string; user_id: string; role: Role }>(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3) RETURNING org_id, user_id, role`,
    [orgId, userId, role],
  );
  return rows[0]!;
}

/** Locks all membership rows of the org (for last-admin checks). Requires a transaction client. */
export async function lockAll(client: Db, orgId: OrgId): Promise<LockedMember[]> {
  assertOrg(orgId);
  const { rows } = await client.query<LockedMember>(
    `SELECT m.user_id, m.role, u.name
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1 ORDER BY m.user_id FOR UPDATE OF m`,
    [orgId],
  );
  return rows;
}

export async function setRole(client: Db, orgId: OrgId, userId: string, role: Role): Promise<void> {
  assertOrg(orgId);
  await client.query(`UPDATE memberships SET role = $3 WHERE org_id = $1 AND user_id = $2`, [orgId, userId, role]);
}

export async function remove(client: Db, orgId: OrgId, userId: string): Promise<void> {
  assertOrg(orgId);
  await client.query(`DELETE FROM memberships WHERE org_id = $1 AND user_id = $2`, [orgId, userId]);
}
