import type { BudgetStatus, Priority, Role, Status } from './domain.js';

// Human labels shared by views and activity-log summaries.

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', member: 'Member', viewer: 'Viewer' };
export const STATUS_LABEL: Record<Status, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
export const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };
export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = { on_track: 'On track', at_risk: 'At risk', overrun: 'Overrun' };

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: 'Admins manage members, projects and budgets, and can do everything members can.',
  member: 'Members can see every project and its budget, and add, edit and delete tasks.',
  viewer: 'Viewers can see every project, budget and task, but cannot change anything.',
};

/** '2026-12-05' -> '5 Dec 2026' (calendar dates are stored as plain strings, no time zone). */
export function formatDate(isoDate: string | null | undefined, { year = true }: { year?: boolean } = {}): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

/** Today's date as 'YYYY-MM-DD' in Addis Ababa (UTC+3), for "overdue" checks. */
export function todayInAddis(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
