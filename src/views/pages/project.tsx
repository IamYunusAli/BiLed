import { h, Fragment, type Html } from '../jsx.js';
import { text, type FormValues, type TenantContext } from '../context.js';
import type { Priority } from '../../domain.js';
import type { MemberRow } from '../../repositories/memberships.js';
import type { PriorityCounts } from '../../repositories/tasks.js';
import type { Project, Task } from '../../services/projects.js';
import { PRIORITY_LABEL, formatDate } from '../../labels.js';
import { formatEtb } from '../../money.js';
import { initials } from '../../view-helpers.js';
import { Badge, FieldError, Meter, Notices, invalidAttrs } from '../partials/common.js';
import { Icon } from '../partials/icon.js';
import { AppPage, Breadcrumb } from '../partials/layout.js';
import { TaskFields } from '../partials/task-fields.js';

export interface ProjectPageProps {
  ctx: TenantContext;
  project: Project;
  tasks: Task[];
  counts: PriorityCounts;
  priority: Priority | 'all';
  /** An unknown ?priority= value that was ignored (shown in a notice), or null. */
  ignoredPriority: string | null;
  shownTotal: number;
  shownActual: number;
  assignees: MemberRow[];
  today: string;
}

const FILTERS: Array<[Priority | 'all', string]> = [['all', 'All'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
const plural = (n: number): string => (n === 1 ? '' : 's');

function BudgetPanel({ project }: { project: Project }): Html {
  const overBy = Math.max(project.actual_santim, project.spent_santim) - project.budget_santim;
  return (
    <section class="panel budget-panel" aria-labelledby="budget-h">
      <div class="budget-head">
        <div class="budget-title">
          <h2 id="budget-h" class="eyebrow">Budget</h2>
          <Badge kind="budget" value={project.status} />
        </div>
        {project.status === 'overrun' ? (
          <p><span class="over"><Icon name="warning" size={14} />Actual spending is over budget by {formatEtb(project.actual_santim - project.budget_santim)}</span> · <strong>{project.percent_used}%</strong> committed</p>
        ) : project.over_budget ? (
          <p><span class="over"><Icon name="warning" size={14} />Committed is over budget by {formatEtb(-project.remaining_santim)}</span> · <strong>{project.percent_actual}%</strong> actually spent</p>
        ) : (
          <p><strong>{project.percent_used}%</strong> committed · <strong>{project.percent_actual}%</strong> actually spent · {formatEtb(project.remaining_santim)} left</p>
        )}
      </div>
      <div class="figures">
        <div class="fig">
          <span class="fig-label">Budget</span>
          <span class="figure">{formatEtb(project.budget_santim)}</span>
        </div>
        <div class={`fig${project.over_budget ? ' over' : ''}`}>
          <span class="fig-label">Committed</span>
          <span class="figure">{formatEtb(project.spent_santim)}</span>
          <span class="fig-note">{project.task_count === 0 ? 'No tasks yet' : `Sum of all ${project.task_count} task estimate${plural(project.task_count)}`}</span>
        </div>
        <div class={`fig${project.status === 'overrun' ? ' over' : ''}`}>
          <span class="fig-label">Actually spent</span>
          <span class="figure">{formatEtb(project.actual_santim)}</span>
          <span class="fig-note">{project.actual_count} of {project.task_count} task{plural(project.task_count)} with an actual cost</span>
        </div>
        <div class={`fig${project.over_budget ? ' over' : ''}`}>
          <span class="fig-label">Remaining</span>
          <span class="figure">{project.over_budget ? '−' + formatEtb(-project.remaining_santim) : formatEtb(project.remaining_santim)}</span>
          <span class="fig-note">Budget minus committed · {project.done_count} of {project.task_count} done</span>
        </div>
      </div>
      <div class="meter-wrap">
        <Meter p={project} />
        <ul class="legend">
          <li><span class="swatch swatch-done" aria-hidden="true"></span>Actually spent · {formatEtb(project.actual_santim)}</li>
          <li><span class="swatch swatch-committed" aria-hidden="true"></span>Committed · {formatEtb(project.spent_santim)}</li>
          {project.status === 'overrun' || project.over_budget
            ? <li><span class="swatch swatch-over" aria-hidden="true"></span>Over budget · {formatEtb(overBy)}</li>
            : <li><span class="swatch swatch-remaining" aria-hidden="true"></span>Remaining · {formatEtb(project.remaining_santim)}</li>}
        </ul>
      </div>
    </section>
  );
}

function TasksTable({ ctx, project, tasks, priority, shownTotal, shownActual, today }: ProjectPageProps): Html {
  const { tenant, base, user } = ctx;
  return (
    <div class="table-scroll">
      <table class="table tasks-table">
        <thead>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Assignee</th>
            <th scope="col">Due</th>
            <th scope="col" class="num">Estimate</th>
            <th scope="col" class="num">Actual</th>
            {tenant.canEdit ? <th scope="col" class="num"><span class="sr-only">Actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const overdue = t.due_date && t.status !== 'done' && t.due_date < today;
            const overEstimate = t.actual_cost_santim !== null && t.actual_cost_santim > t.estimated_cost_santim;
            return (
              <tr>
                <td class="title">{t.title}</td>
                <td><Badge kind="status" value={t.status} /></td>
                <td><Badge kind="priority" value={t.priority} /></td>
                <td>
                  {t.assignee_name
                    ? <span class="assignee"><span class="avatar xs" aria-hidden="true">{initials(t.assignee_name)}</span>{t.assignee_id === user.id ? 'You' : t.assignee_name}</span>
                    : <span class="faint">Unassigned</span>}
                </td>
                <td class="nowrap">
                  {!t.due_date
                    ? <span class="faint">—</span>
                    : overdue
                      ? <span class="due-overdue"><Icon name="warning" size={12} />{formatDate(t.due_date, { year: false })}<span class="sr-only"> (overdue)</span></span>
                      : formatDate(t.due_date, { year: false })}
                </td>
                <td class="num">{formatEtb(t.estimated_cost_santim)}</td>
                <td class={`num${overEstimate ? ' over-estimate' : ''}`}>{t.actual_cost_santim === null ? '—' : formatEtb(t.actual_cost_santim)}{overEstimate ? <span class="sr-only"> (over the estimate)</span> : null}</td>
                {tenant.canEdit ? (
                  <td class="actions">
                    <div class="row-actions">
                      <a class="icon-btn" href={`${base}/tasks/${t.id}/edit`} aria-label={`Edit ${t.title}`}><Icon name="edit" /></a>
                      <form method="post" action={`${base}/tasks/${t.id}/delete`} class="inline" data-confirm={`Delete the task “${t.title}”?`}>
                        <button type="submit" class="icon-btn" aria-label={`Delete ${t.title}`}><Icon name="trash" /></button>
                      </form>
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5">{priority === 'all' ? 'Total' : PRIORITY_LABEL[priority] + ' priority · of ' + formatEtb(project.spent_santim) + ' committed'}</td>
            <td class="num total">{formatEtb(shownTotal)}</td>
            <td class="num total">{formatEtb(shownActual)}</td>
            {tenant.canEdit ? <td></td> : null}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ProjectPage(props: ProjectPageProps): Html {
  const { ctx, project, tasks, counts, priority, ignoredPriority, assignees } = props;
  const { tenant, base, user, errors, values } = ctx;
  const projectUrl = `${base}/projects/${project.id}`;
  return (
    <AppPage ctx={ctx} title={project.name} mainClass="main">
      <Breadcrumb items={[{ label: 'Organizations', href: '/orgs' }, { label: tenant.orgName, href: base }, { label: project.name }]} />
      <Notices ctx={ctx} />
      {ignoredPriority ? (
        <div class="notice notice-info" role="status"><Icon name="info" /><span>Unknown priority “{ignoredPriority}” was ignored. Showing all tasks.</span></div>
      ) : null}

      <div class="title-block">
        <div class="titles">
          <h1 class="page-title">{project.name}</h1>
          {project.description ? <p class="lede">{project.description}</p> : null}
        </div>
        {tenant.isAdmin ? (
          <div class="inline-fields">
            <a class="btn btn-secondary" href={`${projectUrl}/edit`}><Icon name="edit" />Edit project</a>
            <form method="post" action={`${projectUrl}/delete`} class="inline" data-confirm={`Delete ${project.name} and its ${project.task_count} task${plural(project.task_count)}? This can't be undone.`}>
              <button type="submit" class="btn btn-danger"><Icon name="trash" />Delete project</button>
            </form>
          </div>
        ) : null}
      </div>

      <BudgetPanel project={project} />

      <div class="split">
        <section class="split-main wide panel" aria-labelledby="tasks-h">
          <div class="panel-head between">
            <h2 id="tasks-h" class="section-title title-with-count">Tasks <span class="count">{tasks.length}</span></h2>
            <nav class="segmented" aria-label="Filter by priority">
              {FILTERS.map(([key, label]) => (
                <a href={`${projectUrl}${key === 'all' ? '' : '?priority=' + key}`} aria-current={priority === key ? 'page' : undefined}>{label} <span>{counts[key]}</span></a>
              ))}
            </nav>
          </div>
          {tasks.length === 0 ? (
            <div class="empty-state">
              {priority !== 'all' ? (
                <>
                  <p class="what">No {priority}-priority tasks in this project</p>
                  <p>Change a task's priority from its edit form.</p>
                  <a class="btn btn-secondary" href={projectUrl}>Show all tasks</a>
                </>
              ) : (
                <>
                  <p class="what">No tasks in this project yet</p>
                  <p>{tenant.canEdit ? "Add the first task with its estimated cost. It counts towards the project's committed budget." : 'Admins and members of this organization add tasks here.'}</p>
                  {tenant.canEdit ? <a class="btn btn-secondary" href="#add-task">Add a task</a> : null}
                </>
              )}
            </div>
          ) : (
            <TasksTable {...props} />
          )}
        </section>

        {tenant.canEdit ? (
          <aside class="split-side narrow panel panel-pad" aria-labelledby="add-h" id="add-task">
            <form method="post" action={`${projectUrl}/tasks`} class="form-stack" novalidate>
              <h2 id="add-h" class="section-title">Add task</h2>
              <TaskFields v={values} idPrefix="t" withActual={false} assignees={assignees} errors={errors} user={user} />
              <button type="submit" class="btn btn-primary"><Icon name="plus" />Add task</button>
            </form>
          </aside>
        ) : (
          <aside class="split-side narrow panel panel-pad viewer-note" aria-label="Read-only access">
            <h2 class="section-title">Read-only access</h2>
            <p class="muted">You're a viewer in {tenant.orgName}. You can see every project, budget and task, but only admins and members can change them.</p>
          </aside>
        )}
      </div>
    </AppPage>
  );
}

export function ProjectEditPage({ ctx, project }: { ctx: TenantContext; project: Project }): Html {
  const { tenant, base, errors, values } = ctx;
  const v: FormValues = Object.keys(values).length ? values : { name: project.name, description: project.description, budget: project.budget_etb };
  const projectUrl = `${base}/projects/${project.id}`;
  return (
    <AppPage ctx={ctx} title={`Edit ${project.name}`} mainClass="main form-page">
      <Breadcrumb items={[{ label: 'Organizations', href: '/orgs' }, { label: tenant.orgName, href: base }, { label: project.name, href: projectUrl }, { label: 'Edit' }]} />
      <Notices ctx={ctx} />
      <h1 class="page-title">Edit project</h1>

      <section class="panel panel-pad" aria-label="Project details">
        <form method="post" action={`${projectUrl}/edit`} class="form-stack" novalidate>
          <div class={`field${errors.name ? ' invalid' : ''}`}>
            <label for="p-name">Name</label>
            <input class="input" id="p-name" name="name" type="text" maxlength="120" required value={text(v.name)} {...invalidAttrs(errors, 'name', 'p-name')} />
            <FieldError errors={errors} name="name" id="p-name" />
          </div>
          <div class={`field${errors.budget ? ' invalid' : ''}`}>
            <label for="p-budget">Budget</label>
            <div class="money"><span class="money-unit">ETB</span><input id="p-budget" name="budget" type="text" inputmode="decimal" placeholder="0.00" required value={text(v.budget)} {...invalidAttrs(errors, 'budget', 'p-budget')} /></div>
            <FieldError errors={errors} name="budget" id="p-budget" />
          </div>
          <div class="field">
            <label for="p-desc">Description <span class="opt">(optional)</span></label>
            <textarea class="textarea" id="p-desc" name="description" rows="3" maxlength="2000">{text(v.description)}</textarea>
          </div>
          <div class="inline-fields">
            <button type="submit" class="btn btn-primary">Save changes</button>
            <a class="btn btn-secondary" href={projectUrl}>Cancel</a>
          </div>
        </form>
      </section>
    </AppPage>
  );
}

export function TaskEditPage({ ctx, task, project, assignees }: { ctx: TenantContext; task: Task; project: Project; assignees: MemberRow[] }): Html {
  const { tenant, base, user, errors, values } = ctx;
  const v: FormValues = Object.keys(values).length ? values : {
    title: task.title, description: task.description, status: task.status, priority: task.priority,
    estimatedCost: task.estimated_cost_etb, actualCost: task.actual_cost_etb ?? '', assigneeId: task.assignee_id ?? '', dueDate: task.due_date ?? '',
  };
  const projectUrl = `${base}/projects/${project.id}`;
  return (
    <AppPage ctx={ctx} title={`Edit ${task.title}`} mainClass="main form-page">
      <Breadcrumb items={[{ label: 'Organizations', href: '/orgs' }, { label: tenant.orgName, href: base }, { label: project.name, href: projectUrl }, { label: 'Edit task' }]} />
      <Notices ctx={ctx} />
      <h1 class="page-title">Edit task</h1>

      <section class="panel panel-pad" aria-label="Task details">
        <form method="post" action={`${base}/tasks/${task.id}/edit`} class="form-stack" novalidate>
          <TaskFields v={v} idPrefix="e" withActual assignees={assignees} errors={errors} user={user} />
          <div class="inline-fields">
            <button type="submit" class="btn btn-primary">Save task</button>
            <a class="btn btn-secondary" href={projectUrl}>Cancel</a>
          </div>
        </form>
      </section>
    </AppPage>
  );
}
