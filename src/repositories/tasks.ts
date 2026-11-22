import { defaultDb, query, type Db } from '../db.js';
import type { OrgId, Priority, Role, Status } from '../domain.js';
import type { TaskInput, TaskPatch } from '../validation.js';
import { assertOrg } from './tenant-guard.js';

export interface TaskRow {
  id: string;
  org_id: string;
  project_id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  estimated_cost_santim: number;
  actual_cost_santim: number | null;
  assignee_id: string | null;
  due_date: string | null;
  created_at: Date;
  updated_at: Date;
  assignee_name: string | null;
}

export interface AssignedTaskRow {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  due_date: string | null;
  estimated_cost_santim: number;
  actual_cost_santim: number | null;
  org_id: string;
  org_name: string;
  role: Role;
  project_id: string;
  project_name: string;
}

export type PriorityCounts = Record<Priority, number> & { all: number };

const COLUMNS = `t.id, t.org_id, t.project_id, t.title, t.description, t.status, t.priority,
  t.estimated_cost_santim, t.actual_cost_santim, t.assignee_id, t.due_date, t.created_at, t.updated_at,
  u.name AS assignee_name`;

// The assignee join is only for the display name; the composite FK guarantees the assignee is a
// member of the task's own organization.
const FROM = `FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id`;

const PRIORITY_ORDER = `CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;

/** Tasks of one project, high priority first. The priority filter runs in SQL, never in the browser. */
export async function list(orgId: OrgId, projectId: string, { priority }: { priority?: Priority | undefined } = {}): Promise<TaskRow[]> {
  assertOrg(orgId);
  const params: unknown[] = [orgId, projectId];
  let where = `t.org_id = $1 AND t.project_id = $2`;
  if (priority) {
    params.push(priority);
    where += ` AND t.priority = $3`;
  }
  const { rows } = await query<TaskRow>(`SELECT ${COLUMNS} ${FROM} WHERE ${where} ORDER BY ${PRIORITY_ORDER}, t.created_at`, params);
  return rows;
}

/** { high, medium, low, all } counts for the filter control. */
export async function priorityCounts(orgId: OrgId, projectId: string): Promise<PriorityCounts> {
  assertOrg(orgId);
  const { rows } = await query<{ priority: Priority; n: number }>(
    `SELECT priority, count(*)::int AS n FROM tasks WHERE org_id = $1 AND project_id = $2 GROUP BY priority`,
    [orgId, projectId],
  );
  const counts: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
  for (const r of rows) counts[r.priority] = r.n;
  return { ...counts, all: counts.high + counts.medium + counts.low };
}

export async function get(orgId: OrgId, taskId: string, db: Db = defaultDb, { forUpdate = false } = {}): Promise<TaskRow | null> {
  assertOrg(orgId);
  const lock = forUpdate ? ' FOR UPDATE OF t' : '';
  const { rows } = await db.query<TaskRow>(`SELECT ${COLUMNS} ${FROM} WHERE t.org_id = $1 AND t.id = $2${lock}`, [orgId, taskId]);
  return rows[0] ?? null;
}

/**
 * Inserts only if the project belongs to this org: the SELECT yields no row for a project of
 * another tenant, so nothing is inserted (-> null -> 404). The composite foreign keys
 * (project_id, org_id) and (org_id, assignee_id) are the second line of defence.
 */
export async function create(orgId: OrgId, projectId: string, data: TaskInput, db: Db = defaultDb): Promise<TaskRow | null> {
  assertOrg(orgId);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO tasks (org_id, project_id, title, description, status, priority,
                        estimated_cost_santim, actual_cost_santim, assignee_id, due_date)
     SELECT p.org_id, p.id, $3, $4, $5, $6, $7, $8, $9, $10
       FROM projects p
      WHERE p.org_id = $1 AND p.id = $2
     RETURNING id`,
    [
      orgId,
      projectId,
      data.title,
      data.description,
      data.status,
      data.priority,
      data.estimatedCost,
      data.actualCost ?? null,
      data.assigneeId ?? null,
      data.dueDate ?? null,
    ],
  );
  return rows[0] ? get(orgId, rows[0].id, db) : null;
}

// Whitelist of updatable fields -> columns. undefined = leave unchanged; null = clear.
const UPDATABLE: Record<keyof TaskPatch, string> = {
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  estimatedCost: 'estimated_cost_santim',
  actualCost: 'actual_cost_santim',
  assigneeId: 'assignee_id',
  dueDate: 'due_date',
};

export async function update(orgId: OrgId, taskId: string, patch: TaskPatch, db: Db = defaultDb): Promise<TaskRow | null> {
  assertOrg(orgId);
  const sets: string[] = [];
  const params: unknown[] = [orgId, taskId];
  for (const [field, column] of Object.entries(UPDATABLE) as Array<[keyof TaskPatch, string]>) {
    if (patch[field] === undefined) continue;
    params.push(patch[field]);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length === 0) return get(orgId, taskId, db);
  const { rowCount } = await db.query(
    `UPDATE tasks SET ${sets.join(', ')}, updated_at = now() WHERE org_id = $1 AND id = $2`,
    params,
  );
  return rowCount ? get(orgId, taskId, db) : null;
}

export async function remove(orgId: OrgId, taskId: string, db: Db = defaultDb): Promise<{ project_id: string; title: string } | null> {
  assertOrg(orgId);
  const { rows } = await db.query<{ project_id: string; title: string }>(
    `DELETE FROM tasks WHERE org_id = $1 AND id = $2 RETURNING project_id, title`,
    [orgId, taskId],
  );
  return rows[0] ?? null;
}

/** When someone becomes a viewer they can no longer work on tasks: unassign them. */
export async function unassignUser(orgId: OrgId, userId: string, db: Db = defaultDb): Promise<void> {
  assertOrg(orgId);
  await db.query(`UPDATE tasks SET assignee_id = NULL, updated_at = now() WHERE org_id = $1 AND assignee_id = $2`, [
    orgId,
    userId,
  ]);
}

/**
 * "My tasks" across every organization the user belongs to. The membership join makes the
 * tenant boundary explicit: only tasks in orgs where the user is (still) a member are returned.
 */
export async function listAssignedTo(userId: string): Promise<AssignedTaskRow[]> {
  const { rows } = await query<AssignedTaskRow>(
    `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.estimated_cost_santim, t.actual_cost_santim,
            t.org_id, o.name AS org_name, m.role, p.id AS project_id, p.name AS project_name
       FROM tasks t
       JOIN memberships m ON m.org_id = t.org_id AND m.user_id = $1
       JOIN organizations o ON o.id = t.org_id
       JOIN projects p ON p.id = t.project_id AND p.org_id = t.org_id
      WHERE t.assignee_id = $1
      ORDER BY o.name, (t.status = 'done'), t.due_date NULLS LAST, ${PRIORITY_ORDER}, t.created_at`,
    [userId],
  );
  return rows;
}
