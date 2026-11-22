import { withTx, type Db } from '../db.js';
import * as projects from '../repositories/projects.js';
import type { ProjectRow } from '../repositories/projects.js';
import * as tasks from '../repositories/tasks.js';
import type { AssignedTaskRow, PriorityCounts, TaskRow } from '../repositories/tasks.js';
import * as memberships from '../repositories/memberships.js';
import { budgetSummary, santimToEtb, formatEtb } from '../money.js';
import { STATUS_LABEL, PRIORITY_LABEL, formatDate } from '../labels.js';
import { log, q } from './activity.js';
import { HttpError } from '../http-error.js';
import type { Priority, Role, Tenant } from '../domain.js';
import type { ProjectInput, ProjectPatch, TaskInput, TaskPatch } from '../validation.js';

// Every call is scoped by tenant.orgId (verified membership). A project or task id from another
// org simply matches no row, which surfaces as 404, identical to "does not exist".
// Every change writes its activity-log entry in the same transaction.

export function present(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    task_count: row.task_count,
    done_count: row.done_count,
    actual_count: row.actual_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...budgetSummary(row.budget_santim, row.spent_santim, row.done_santim, row.actual_santim),
  };
}
export type Project = ReturnType<typeof present>;

export function presentTask(row: TaskRow) {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    estimated_cost_santim: row.estimated_cost_santim,
    estimated_cost_etb: santimToEtb(row.estimated_cost_santim),
    actual_cost_santim: row.actual_cost_santim,
    actual_cost_etb: row.actual_cost_santim === null ? null : santimToEtb(row.actual_cost_santim),
    assignee_id: row.assignee_id,
    assignee_name: row.assignee_name,
    due_date: row.due_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
export type Task = ReturnType<typeof presentTask>;

// ---- Projects ----------------------------------------------------------------------------------
export async function list(tenant: Tenant): Promise<Project[]> {
  return (await projects.list(tenant.orgId)).map(present);
}

export async function get(tenant: Tenant, projectId: string, db?: Db): Promise<Project> {
  const row = await projects.get(tenant.orgId, projectId, db);
  if (!row) throw new HttpError(404);
  return present(row);
}

export function create(tenant: Tenant, data: ProjectInput): Promise<Project> {
  return withTx(async (c) => {
    const id = await projects.create(tenant.orgId, data, c);
    await log(c, tenant, {
      action: 'project.created', entityType: 'project', entityId: id,
      summary: `created project ${q(data.name)} with a budget of ${formatEtb(data.budget)}`,
    });
    return get(tenant, id, c);
  });
}

export function update(tenant: Tenant, projectId: string, data: ProjectPatch): Promise<Project> {
  return withTx(async (c) => {
    const before = await projects.get(tenant.orgId, projectId, c);
    if (!before) throw new HttpError(404);
    await projects.update(tenant.orgId, projectId, data, c);
    const changes: string[] = [];
    if (data.name !== undefined && data.name !== before.name) changes.push(`renamed it from ${q(before.name)}`);
    if (data.budget !== undefined && data.budget !== before.budget_santim) {
      changes.push(`changed the budget from ${formatEtb(before.budget_santim)} to ${formatEtb(data.budget)}`);
    }
    if (data.description !== undefined && data.description !== before.description) changes.push('edited the description');
    if (changes.length) {
      await log(c, tenant, {
        action: 'project.updated', entityType: 'project', entityId: projectId,
        summary: `updated project ${q(data.name ?? before.name)}: ${changes.join('; ')}`,
      });
    }
    return get(tenant, projectId, c);
  });
}

export function remove(tenant: Tenant, projectId: string): Promise<void> {
  return withTx(async (c) => {
    const removed = await projects.remove(tenant.orgId, projectId, c);
    if (!removed) throw new HttpError(404);
    await log(c, tenant, {
      action: 'project.deleted', entityType: 'project', entityId: projectId,
      summary: `deleted project ${q(removed.name)} and its tasks`,
    });
  });
}

// ---- Tasks -------------------------------------------------------------------------------------

/** The assignee must be an admin or member of THIS org (viewers can't work on tasks). */
async function assertAssignable(tenant: Tenant, assigneeId: string | null | undefined, db: Db): Promise<string | null> {
  if (!assigneeId) return null;
  const m = await memberships.find(tenant.orgId, assigneeId, db);
  if (!m || m.role === 'viewer') {
    throw new HttpError(400, 'Choose an admin or member of this organization', { assigneeId: ['Not a member who can work on tasks'] });
  }
  return m.user_name;
}

export async function listTasks(tenant: Tenant, projectId: string, { priority }: { priority?: Priority | undefined } = {}): Promise<Task[]> {
  await get(tenant, projectId); // 404 if the project is not in this org
  return (await tasks.list(tenant.orgId, projectId, { priority })).map(presentTask);
}

export function priorityCounts(tenant: Tenant, projectId: string): Promise<PriorityCounts> {
  return tasks.priorityCounts(tenant.orgId, projectId);
}

export async function getTask(tenant: Tenant, taskId: string): Promise<Task> {
  const row = await tasks.get(tenant.orgId, taskId);
  if (!row) throw new HttpError(404);
  return presentTask(row);
}

export function createTask(tenant: Tenant, projectId: string, data: TaskInput): Promise<Task> {
  return withTx(async (c) => {
    const assigneeName = await assertAssignable(tenant, data.assigneeId, c);
    const row = await tasks.create(tenant.orgId, projectId, data, c);
    const project = row && (await projects.get(tenant.orgId, projectId, c));
    if (!row || !project) throw new HttpError(404);
    const extras = [`estimate ${formatEtb(data.estimatedCost)}`, `${PRIORITY_LABEL[data.priority].toLowerCase()} priority`];
    if (assigneeName) extras.push(`assigned to ${assigneeName}`);
    await log(c, tenant, {
      action: 'task.created', entityType: 'task', entityId: row.id,
      summary: `added task ${q(data.title)} to ${q(project.name)} (${extras.join(', ')})`,
    });
    return presentTask(row);
  });
}

function describeTaskChanges(before: TaskRow, patch: TaskPatch, assigneeName: string | null): string[] {
  const changes: string[] = [];
  const money = (s: number | null | undefined) => (s === null || s === undefined ? 'not recorded' : formatEtb(s));
  if (patch.title !== undefined && patch.title !== before.title) changes.push(`renamed from ${q(before.title)}`);
  if (patch.status !== undefined && patch.status !== before.status) changes.push(`status ${STATUS_LABEL[before.status]} → ${STATUS_LABEL[patch.status]}`);
  if (patch.priority !== undefined && patch.priority !== before.priority) changes.push(`priority ${PRIORITY_LABEL[before.priority]} → ${PRIORITY_LABEL[patch.priority]}`);
  if (patch.estimatedCost !== undefined && patch.estimatedCost !== before.estimated_cost_santim) changes.push(`estimate ${money(before.estimated_cost_santim)} → ${money(patch.estimatedCost)}`);
  if (patch.actualCost !== undefined && patch.actualCost !== before.actual_cost_santim) changes.push(`actual cost ${money(before.actual_cost_santim)} → ${money(patch.actualCost)}`);
  if (patch.assigneeId !== undefined && patch.assigneeId !== before.assignee_id) changes.push(patch.assigneeId ? `assigned to ${assigneeName}` : 'unassigned');
  if (patch.dueDate !== undefined && patch.dueDate !== before.due_date) changes.push(patch.dueDate ? `due ${formatDate(patch.dueDate)}` : 'due date cleared');
  if (patch.description !== undefined && patch.description !== before.description) changes.push('edited the description');
  return changes;
}

export function updateTask(tenant: Tenant, taskId: string, patch: TaskPatch): Promise<Task> {
  return withTx(async (c) => {
    const before = await tasks.get(tenant.orgId, taskId, c, { forUpdate: true });
    if (!before) throw new HttpError(404);
    const assigneeName = patch.assigneeId ? await assertAssignable(tenant, patch.assigneeId, c) : null;
    const row = await tasks.update(tenant.orgId, taskId, patch, c);
    if (!row) throw new HttpError(404);
    const changes = describeTaskChanges(before, patch, assigneeName);
    if (changes.length) {
      await log(c, tenant, {
        action: 'task.updated', entityType: 'task', entityId: taskId,
        summary: `updated task ${q(row.title)}: ${changes.join('; ')}`,
      });
    }
    return presentTask(row);
  });
}

export function removeTask(tenant: Tenant, taskId: string): Promise<string> {
  return withTx(async (c) => {
    const removed = await tasks.remove(tenant.orgId, taskId, c);
    if (!removed) throw new HttpError(404);
    await log(c, tenant, {
      action: 'task.deleted', entityType: 'task', entityId: taskId,
      summary: `deleted task ${q(removed.title)}`,
    });
    return removed.project_id;
  });
}

export interface MyTaskGroup {
  orgId: string;
  orgName: string;
  role: Role;
  tasks: AssignedTaskRow[];
}

/** "My tasks" across all of the user's organizations, grouped by org. */
export async function myTasks(userId: string): Promise<MyTaskGroup[]> {
  const rows = await tasks.listAssignedTo(userId);
  const groups = new Map<string, MyTaskGroup>();
  for (const r of rows) {
    let group = groups.get(r.org_id);
    if (!group) {
      group = { orgId: r.org_id, orgName: r.org_name, role: r.role, tasks: [] };
      groups.set(r.org_id, group);
    }
    group.tasks.push(r);
  }
  return [...groups.values()];
}
