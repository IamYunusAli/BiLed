import { defaultDb, query, type Db } from '../db.js';
import type { OrgId } from '../domain.js';
import { assertOrg } from './tenant-guard.js';

export interface ActivityEntry {
  orgId: OrgId;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
}

export interface ActivityRow {
  id: number;
  actor_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  created_at: Date;
}

/** Appends one entry. Call it with the same transaction client as the change it describes. */
export async function record(db: Db = defaultDb, { orgId, actorId, actorName, action, entityType, entityId = null, summary }: ActivityEntry): Promise<void> {
  assertOrg(orgId);
  await db.query(
    `INSERT INTO activity (org_id, actor_id, actor_name, action, entity_type, entity_id, summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [orgId, actorId, actorName, action, entityType, entityId, summary],
  );
}

/** Newest first, scoped to one org. */
export async function list(orgId: OrgId, { limit = 50 }: { limit?: number } = {}): Promise<ActivityRow[]> {
  assertOrg(orgId);
  const { rows } = await query<ActivityRow>(
    `SELECT id, actor_id, actor_name, action, entity_type, entity_id, summary, created_at
       FROM activity WHERE org_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [orgId, limit],
  );
  return rows;
}
