import { h, type Html } from '../jsx.js';
import type { PageContext, TenantContext, UserContext } from '../context.js';
import type { ActivityRow } from '../../repositories/activity.js';
import type { MyTaskGroup } from '../../services/projects.js';
import { formatDate } from '../../labels.js';
import { formatEtb } from '../../money.js';
import { ActivityList, Badge, Tile } from '../partials/common.js';
import { Icon } from '../partials/icon.js';
import { AppPage, Breadcrumb } from '../partials/layout.js';

export function ActivityPage({ ctx, activity }: { ctx: TenantContext; activity: ActivityRow[] }): Html {
  const { tenant, base, user } = ctx;
  return (
    <AppPage ctx={ctx} title={`Activity · ${tenant.orgName}`} mainClass="main form-page">
      <Breadcrumb items={[{ label: 'Organizations', href: '/orgs' }, { label: tenant.orgName, href: base }, { label: 'Activity' }]} />
      <div class="stack-6">
        <h1 class="page-title">Activity</h1>
        <p class="lede">Every change to budgets, tasks, members and invites in {tenant.orgName}, newest first. Entries can't be edited.</p>
      </div>
      <section class="panel">
        <ActivityList activity={activity} user={user} />
      </section>
    </AppPage>
  );
}

export function MyTasksPage({ ctx, groups, today }: { ctx: UserContext; groups: MyTaskGroup[]; today: string }): Html {
  return (
    <AppPage ctx={ctx} title="My tasks" mainClass="main">
      <div class="stack-6">
        <h1 class="page-title">My tasks</h1>
        <p class="lede">Tasks assigned to you, in every organization you belong to.</p>
      </div>

      {groups.length === 0 ? (
        <section class="panel">
          <div class="empty-state">
            <p class="what">Nothing is assigned to you</p>
            <p>When someone assigns you a task, it shows up here.</p>
            <a class="btn btn-secondary" href="/orgs">Go to your organizations</a>
          </div>
        </section>
      ) : null}

      {groups.map((g) => {
        const open = g.tasks.filter((t) => t.status !== 'done').length;
        return (
          <section class="panel" aria-labelledby={`g-${g.orgId}`}>
            <div class="panel-head">
              <Tile name={g.orgName} size={24} />
              <h2 id={`g-${g.orgId}`} class="section-title"><a class="plain-link" href={`/orgs/${g.orgId}`}>{g.orgName}</a></h2>
              <span class="count">{open} open</span>
            </div>
            <div class="table-scroll">
              <table class="table tasks-table">
                <thead>
                  <tr>
                    <th scope="col">Task</th>
                    <th scope="col">Project</th>
                    <th scope="col">Status</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Due</th>
                    <th scope="col" class="num">Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {g.tasks.map((t) => {
                    const overdue = t.due_date && t.status !== 'done' && t.due_date < today;
                    return (
                      <tr>
                        <td class="title">{g.role !== 'viewer' ? <a class="plain-link" href={`/orgs/${g.orgId}/tasks/${t.id}/edit`}>{t.title}</a> : t.title}</td>
                        <td><a class="quiet-link" href={`/orgs/${g.orgId}/projects/${t.project_id}`}>{t.project_name}</a></td>
                        <td><Badge kind="status" value={t.status} /></td>
                        <td><Badge kind="priority" value={t.priority} /></td>
                        <td class="nowrap">
                          {!t.due_date
                            ? <span class="faint">—</span>
                            : overdue
                              ? <span class="due-overdue"><Icon name="warning" size={12} />{formatDate(t.due_date)}<span class="sr-only"> (overdue)</span></span>
                              : formatDate(t.due_date)}
                        </td>
                        <td class="num">{formatEtb(t.estimated_cost_santim)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </AppPage>
  );
}

const ERROR_TITLE: Record<number, string> = {
  404: 'Page not found',
  403: 'Not allowed',
  429: 'Too many attempts',
  503: 'Temporarily unavailable',
};

export function ErrorPage({ ctx, status, message }: { ctx: PageContext; status: number; message: string }): Html {
  const { user } = ctx;
  return (
    <AppPage ctx={ctx} title={`Error ${status}`} mainClass="main centered">
      <div class="message-block">
        <span class="big-code">{status}</span>
        <h1>{ERROR_TITLE[status] ?? 'Something went wrong'}</h1>
        <p>{status === 404 ? "This page doesn't exist, or it belongs to an organization you're not a member of." : message}</p>
        <a class="btn btn-primary" href={user ? '/orgs' : '/login'}>{user ? 'Go to your organizations' : 'Go to sign in'}</a>
      </div>
    </AppPage>
  );
}
