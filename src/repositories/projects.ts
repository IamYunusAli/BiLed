import { defaultDb, query, type Db } from '../db.js';
import type { OrgId } from '../domain.js';
import type { ProjectInput, ProjectPatch } from '../validation.js';
import { assertOrg } from './tenant-guard.js';

export interface ProjectRow {
  id: string;
  org_id: string;
  name: string;
  description: string;
  budget_santim: number;
  created_at: Date;
  updated_at: Date;
  spent_santim: number;
  actual_santim: number;
  done_santim: number;
  task_count: number;
  done_count: number;
  actual_count: number;
}

// Budget vs committed vs actual. "Committed" (exposed as spent) = sum of task estimates;
// "actual" = sum of recorded actual costs; "done" = estimates of finished tasks.
// The join is scoped on org_id too.
const SELECT_WITH_TOTALS = `
  SELECT p.id, p.org_id, p.name, p.description, p.budget_santim, p.created_at, p.updated_at,
         COALESCE(SUM(t.estimated_cost_santim), 0)::bigint                                   AS spent_santim,
         COALESCE(SUM(t.actual_cost_santim), 0)::bigint                                      AS actual_santim,
         COALESCE(SUM(t.estimated_cost_santim) FILTER (WHERE t.status = 'done'), 0)::bigint AS done_santim,
         COUNT(t.id)::int                                                                     AS task_count,
         (COUNT(t.id) FILTER (WHERE t.status = 'done'))::int                                  AS done_count,
         (COUNT(t.id) FILTER (WHERE t.actual_cost_santim IS NOT NULL))::int                   AS actual_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id AND t.org_id = p.org_id`;

export async function list(orgId: OrgId): Promise<ProjectRow[]> {
  assertOrg(orgId);
  const { rows } = await query<ProjectRow>(`${SELECT_WITH_TOTALS} WHERE p.org_id = $1 GROUP BY p.id ORDER BY p.created_at`, [orgId]);
  return rows;
}

export async function get(orgId: OrgId, projectId: string, db: Db = defaultDb): Promise<ProjectRow | null> {
  assertOrg(orgId);
  const { rows } = await db.query<ProjectRow>(`${SELECT_WITH_TOTALS} WHERE p.org_id = $1 AND p.id = $2 GROUP BY p.id`, [
    orgId,
    projectId,
  ]);
  return rows[0] ?? null;
}

export async function create(orgId: OrgId, { name, description, budget }: ProjectInput, db: Db = defaultDb): Promise<string> {
  assertOrg(orgId);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO projects (org_id, name, description, budget_santim) VALUES ($1, $2, $3, $4) RETURNING id`,
    [orgId, name, description, budget],
  );
  return rows[0]!.id;
}

/** Partial update; undefined fields are left unchanged. Returns false when no row matched. */
export async function update(orgId: OrgId, projectId: string, { name, description, budget }: ProjectPatch, db: Db = defaultDb): Promise<boolean> {
  assertOrg(orgId);
  const { rowCount } = await db.query(
    `UPDATE projects
        SET name = COALESCE($3, name),
            description = COALESCE($4, description),
            budget_santim = COALESCE($5, budget_santim),
            updated_at = now()
      WHERE org_id = $1 AND id = $2`,
    [orgId, projectId, name ?? null, description ?? null, budget ?? null],
  );
  return (rowCount ?? 0) > 0;
}

export async function remove(orgId: OrgId, projectId: string, db: Db = defaultDb): Promise<{ name: string } | null> {
  assertOrg(orgId);
  const { rows } = await db.query<{ name: string }>(`DELETE FROM projects WHERE org_id = $1 AND id = $2 RETURNING name`, [orgId, projectId]);
  return rows[0] ?? null;
}
