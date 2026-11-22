import { defaultDb, query, type Db } from '../db.js';
import type { OrgId, Role } from '../domain.js';
import { assertOrg } from './tenant-guard.js';

export interface MyOrgRow {
  id: string;
  name: string;
  created_at: Date;
  role: Role;
  member_count: number;
  project_count: number;
}

export interface OrgRow {
  id: string;
  name: string;
  created_at: Date;
}

/** Organizations the user is a member of, with the user's role. Never lists other orgs. */
export async function listForUser(userId: string): Promise<MyOrgRow[]> {
  const { rows } = await query<MyOrgRow>(
    `SELECT o.id, o.name, o.created_at, m.role,
            (SELECT count(*)::int FROM memberships mm WHERE mm.org_id = o.id) AS member_count,
            (SELECT count(*)::int FROM projects p WHERE p.org_id = o.id)      AS project_count
       FROM memberships m
       JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = $1
      ORDER BY o.name, o.created_at`,
    [userId],
  );
  return rows;
}

/** Creates the org and makes the creator its admin, atomically. Requires a transaction client. */
export async function createWithAdmin(client: Db, { name, userId }: { name: string; userId: string }): Promise<OrgRow & { role: 'admin' }> {
  const { rows } = await client.query<OrgRow>(
    `INSERT INTO organizations (name, created_by) VALUES ($1, $2) RETURNING id, name, created_at`,
    [name, userId],
  );
  const org = rows[0]!;
  await client.query(`INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'admin')`, [org.id, userId]);
  return { ...org, role: 'admin' };
}

export async function get(orgId: OrgId): Promise<OrgRow | null> {
  assertOrg(orgId);
  const { rows } = await query<OrgRow>(`SELECT id, name, created_at FROM organizations WHERE id = $1`, [orgId]);
  return rows[0] ?? null;
}

export async function rename(orgId: OrgId, name: string, db: Db = defaultDb): Promise<OrgRow | null> {
  assertOrg(orgId);
  const { rows } = await db.query<OrgRow>(`UPDATE organizations SET name = $2 WHERE id = $1 RETURNING id, name, created_at`, [
    orgId,
    name,
  ]);
  return rows[0] ?? null;
}
