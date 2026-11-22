import { h, Fragment, type Html } from '../jsx.js';
import { text, type TenantContext } from '../context.js';
import type { ActivityRow } from '../../repositories/activity.js';
import type { CreatedInvite, PendingInvite } from '../../repositories/invites.js';
import type { MemberRow } from '../../repositories/memberships.js';
import type { Project } from '../../services/projects.js';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '../../labels.js';
import { formatEtb } from '../../money.js';
import { initials } from '../../view-helpers.js';
import { ActivityList, Badge, FieldError, Meter, Notices, Tile, invalidAttrs } from '../partials/common.js';
import { Icon } from '../partials/icon.js';
import { AppPage, Breadcrumb } from '../partials/layout.js';

/** Admin-only first-run checklist: create a project, invite a teammate, add a first task. */
export function setupSteps(projects: Project[], members: MemberRow[], invitesCreated: number) {
  const firstProject = projects[0];
  const tasks = projects.reduce((n, p) => n + p.task_count, 0);
  const steps = [
    { key: 'project', title: 'Create a project with a budget', done: projects.length > 0,
      summary: firstProject ? `${firstProject.name} · ${formatEtb(firstProject.budget_santim)}` : 'Projects hold the budget that tasks spend.' },
    { key: 'invite', title: 'Invite a teammate', done: members.length > 1 || invitesCreated > 0,
      summary: members.length > 1 ? `${members.length} members` : invitesCreated > 0 ? `${invitesCreated} invite link${invitesCreated === 1 ? '' : 's'} created` : 'Create a single-use link from the Members panel.' },
    { key: 'task', title: 'Add the first task', done: tasks > 0,
      summary: "Each task's estimated cost counts towards the project's committed budget." },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done)?.key ?? null;
  return { steps, doneCount, current, complete: doneCount === steps.length, firstProject };
}
export type Setup = ReturnType<typeof setupSteps>;

export interface OrgPageProps {
  ctx: TenantContext;
  projects: Project[];
  members: MemberRow[];
  adminCount: number;
  invites: PendingInvite[];
  setup: Setup | null;
  activity: ActivityRow[];
  justJoined: boolean;
  /** Shown exactly once, right after creation (the token is never stored). */
  createdInvite: (CreatedInvite & { token: string; url: string }) | null;
}

const LONG_DATE = { day: 'numeric', month: 'short', year: 'numeric' } as const;
const SHORT_DATE = { day: 'numeric', month: 'short' } as const;

function SetupPanel({ setup, base }: { setup: Setup; base: string }): Html {
  return (
    <section class="panel" aria-labelledby="setup-h">
      <div class="panel-head between">
        <div class="stack-6">
          <h2 id="setup-h" class="section-title">Set up your organization</h2>
          <p class="muted">Only admins see this. It disappears once all three steps are done.</p>
        </div>
        <div class="setup-progress">
          <progress value={setup.doneCount} max="3" aria-label={`${setup.doneCount} of 3 steps done`}></progress>
          <span>{setup.doneCount} of 3 done</span>
        </div>
      </div>
      <ol class="steps">
        {setup.steps.map((s, i) => {
          const current = setup.current === s.key;
          return (
            <li class={`step${s.done ? ' done' : ''}${current ? ' current' : ''}`}>
              {s.done
                ? <Icon name="check-success" size={22} />
                : <Icon name="step-number" n={i + 1} color={current ? '#2B47C9' : '#6E6E66'} />}
              <div class="step-body">
                <div class="step-text">
                  <span class="step-title">{i + 1} · {s.title}{s.done ? <> <span class="sr-only">(done)</span></> : null}</span>
                  <span class="step-summary">{s.summary}</span>
                </div>
                {!current ? null
                  : s.key === 'project' ? <a class="btn btn-primary" href="#new-project"><Icon name="plus" />Create a project</a>
                  : s.key === 'invite' ? <a class="btn btn-primary" href="#invite"><Icon name="link" />Create an invite link</a>
                  : setup.firstProject ? <a class="btn btn-primary" href={`${base}/projects/${setup.firstProject.id}#add-task`}><Icon name="plus" />Add a task</a>
                  : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ProjectsTable({ projects, base }: { projects: Project[]; base: string }): Html {
  return (
    <div class="table-scroll">
      <table class="table projects-table">
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col" class="num">Budget</th>
            <th scope="col" class="num">Committed</th>
            <th scope="col" class="num">Actual</th>
            <th scope="col" class="num">Remaining</th>
            <th scope="col" class="used-col">Committed</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr>
              <td>
                <a class="project-link" href={`${base}/projects/${p.id}`}>{p.name}{' '}
                  <span>{p.task_count === 0 ? 'No tasks yet' : `${p.task_count} task${p.task_count === 1 ? '' : 's'} · ${p.done_count} done`}</span></a>
                <Badge kind="budget" value={p.status} />
              </td>
              <td class="num">{formatEtb(p.budget_santim)}</td>
              <td class="num">{formatEtb(p.spent_santim)}</td>
              <td class={`num${p.status === 'overrun' ? ' over-estimate' : ''}`}>{formatEtb(p.actual_santim)}</td>
              <td class="num">{p.over_budget ? '−' + formatEtb(-p.remaining_santim) : formatEtb(p.remaining_santim)}</td>
              <td class="used-col">
                <div class="used-cell">
                  <Meter p={p} small />
                  <span class={`pct${p.over_budget ? ' over' : ''}`}>{p.percent_used}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewProjectForm({ ctx }: { ctx: TenantContext }): Html {
  const { base, errors, values } = ctx;
  return (
    <section class="panel panel-pad" aria-labelledby="newp-h" id="new-project">
      <form method="post" action={`${base}/projects`} class="form-stack" novalidate>
        <h2 id="newp-h" class="section-title">New project</h2>
        <div class="form-grid-auto">
          <div class={`field${errors.name ? ' invalid' : ''}`}>
            <label for="p-name">Name</label>
            <input class="input" id="p-name" name="name" type="text" maxlength="120" required value={text(values.name)} {...invalidAttrs(errors, 'name', 'p-name')} />
            <FieldError errors={errors} name="name" id="p-name" />
          </div>
          <div class={`field${errors.budget ? ' invalid' : ''}`}>
            <label for="p-budget">Budget</label>
            <div class="money"><span class="money-unit">ETB</span><input id="p-budget" name="budget" type="text" inputmode="decimal" placeholder="0.00" required value={text(values.budget)} {...invalidAttrs(errors, 'budget', 'p-budget')} /></div>
            <FieldError errors={errors} name="budget" id="p-budget" />
          </div>
        </div>
        <div class="field">
          <label for="p-desc">Description <span class="opt">(optional)</span></label>
          <textarea class="textarea" id="p-desc" name="description" rows="2" maxlength="2000">{text(values.description)}</textarea>
        </div>
        <div><button type="submit" class="btn btn-primary">Create project</button></div>
      </form>
    </section>
  );
}

function MembersPanel({ ctx, members, adminCount, invites, createdInvite }: Pick<OrgPageProps, 'ctx' | 'members' | 'adminCount' | 'invites' | 'createdInvite'>): Html {
  const { tenant, user, base } = ctx;
  return (
    <aside class="split-side panel" aria-labelledby="mem-h">
      <div class="panel-head">
        <h2 id="mem-h" class="section-title">Members</h2>
        <span class="count">{members.length}</span>
      </div>
      <ul class="members">
        {members.map((m) => {
          const isSelf = m.user_id === user.id;
          const lastAdmin = m.role === 'admin' && adminCount === 1;
          return (
            <li>
              <div class="member-row">
                <span class="avatar" aria-hidden="true">{initials(m.name)}</span>
                <span class="member-id"><span class="name">{m.name}{isSelf ? ' (you)' : ''}</span><span class="email">{m.email}</span></span>
                {!tenant.isAdmin || lastAdmin ? <Badge kind="role" value={m.role} /> : null}
              </div>
              {!tenant.isAdmin ? null : lastAdmin ? (
                <p class="lock-note"><Icon name="lock" />Only admin. Promote someone else before changing this role.</p>
              ) : (
                <div class="member-controls">
                  <form method="post" action={`${base}/members/${m.user_id}/role`} class="role-form">
                    <label for={`role-${m.user_id}`} class="sr-only">Role for {m.name}</label>
                    <select class="select" id={`role-${m.user_id}`} name="role" data-autosubmit>
                      {Object.entries(ROLE_LABEL).map(([r, label]) => <option value={r} selected={m.role === r}>{label}</option>)}
                    </select>
                    <noscript><button type="submit" class="btn btn-secondary btn-sm">Save</button></noscript>
                  </form>
                  <form method="post" action={`${base}/members/${m.user_id}/remove`} class="inline" data-confirm={isSelf ? 'Leave ' + tenant.orgName + '? You will lose access to it.' : 'Remove ' + m.name + ' from ' + tenant.orgName + '?'}>
                    <button type="submit" class="btn btn-danger">{isSelf ? 'Leave' : 'Remove'}</button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {tenant.isAdmin ? (
        <div class="panel-foot" id="invite">
          {createdInvite ? (
            <div class="invite-created" role="status">
              <p><Icon name="check-accent" /><span><strong>Invite link created.</strong> Copy it now; it won't be shown again.</span></p>
              <div class="copy-row">
                <label for="inv-url" class="sr-only">Invite link</label>
                <input class="input" id="inv-url" type="text" readonly value={createdInvite.url} />
                <button type="button" class="btn btn-primary btn-sm" data-copy-target="inv-url" hidden><Icon name="copy" size={14} /><span data-label>Copy</span></button>
              </div>
              <p class="small muted">Joins as {ROLE_LABEL[createdInvite.role]} · single use · expires {new Date(createdInvite.expires_at).toLocaleDateString('en-GB', LONG_DATE)}</p>
            </div>
          ) : null}

          {invites.length > 0 ? (
            <div class="pending stack-6">
              <h3>Pending invites · {invites.length}</h3>
              <ul>
                {invites.map((inv) => (
                  <li class="pending-item">
                    <Icon name="link" />
                    <span class="what"><strong>{ROLE_LABEL[inv.role]} link</strong>{' '}
                      <span class="small muted">Created by {inv.created_by === user.id ? 'you' : (inv.created_by_name ?? 'a former member')} · expires {new Date(inv.expires_at).toLocaleDateString('en-GB', SHORT_DATE)}</span></span>
                    <form method="post" action={`${base}/invites/${inv.id}/revoke`} class="inline">
                      <button type="submit" class="btn btn-danger">Revoke</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form method="post" action={`${base}/invites`} class="form-stack">
            <div class="invite-head stack-6">
              <h3>{invites.length > 0 || createdInvite ? 'Invite someone else' : 'Invite people'}</h3>
              <p>Create a single-use link and send it on Telegram, WhatsApp or SMS. It works for 7 days, whether or not they have an account.</p>
            </div>
            <div class="invite-row">
              <div class="field">
                <label for="m-role">Joins as</label>
                <select class="select" id="m-role" name="role">
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" class="btn btn-primary"><Icon name="link" />Create invite link</button>
            </div>
            <p class="small faint role-hint-member">Members can add and edit tasks but can't change budgets or members.</p>
            <p class="small faint role-hint-viewer">Viewers can see every project, budget and task, but can't change anything. Good for clients and funders.</p>
            <p class="warn role-hint-admin" role="note"><Icon name="warning" size={14} />Whoever opens an admin link can manage members, projects and budgets. Send it only to the person it's for.</p>
            {invites.length === 0 && !createdInvite ? <p class="small faint">No pending invites.</p> : null}
          </form>
        </div>
      ) : null}
    </aside>
  );
}

export function OrgPage(props: OrgPageProps): Html {
  const { ctx, projects, setup, activity, justJoined } = props;
  const { tenant, base, user } = ctx;
  const first = projects[0];
  return (
    <AppPage ctx={ctx} title={tenant.orgName} mainClass="main">
      <Breadcrumb items={[{ label: 'Organizations', href: '/orgs' }, { label: tenant.orgName }]} />

      {justJoined ? (
        <div class="banner" role="status">
          <Icon name="check-accent" size={18} />
          <p><strong>You joined {tenant.orgName} as {ROLE_LABEL[tenant.role]}.</strong>{' '}{ROLE_DESCRIPTION[tenant.role]}</p>
          {first ? <a class="btn btn-secondary btn-sm" href={`${base}/projects/${first.id}`}>Open {first.name}<Icon name="arrow-right" /></a> : null}
        </div>
      ) : null}
      <Notices ctx={ctx} />

      <div class="title-row">
        <Tile name={tenant.orgName} size={48} />
        <h1 class="page-title">{tenant.orgName}</h1>
        {tenant.isAdmin ? (
          <details class="rename">
            <summary class="btn btn-secondary btn-sm"><Icon name="edit" size={14} />Rename</summary>
            <form method="post" action={`${base}/rename`} class="rename-form">
              <label for="org-rename" class="sr-only">Organization name</label>
              <input class="input" id="org-rename" name="name" type="text" maxlength="120" required value={tenant.orgName} />
              <button type="submit" class="btn btn-primary btn-sm">Save</button>
            </form>
          </details>
        ) : null}
      </div>

      {setup && !setup.complete ? <SetupPanel setup={setup} base={base} /> : null}

      <div class="split">
        <div class="split-main">
          <section class="panel" aria-labelledby="proj-h">
            <div class="panel-head">
              <h2 id="proj-h" class="section-title">Projects</h2>
              <span class="count">{projects.length}</span>
            </div>
            {projects.length === 0 ? (
              <div class="empty-state">
                <p class="what">No projects yet</p>
                <p>{tenant.isAdmin ? 'Create the first project and give it a budget in ETB.' : 'An admin of this organization can create the first project.'}</p>
              </div>
            ) : (
              <ProjectsTable projects={projects} base={base} />
            )}
          </section>

          {tenant.isAdmin ? <NewProjectForm ctx={ctx} /> : null}

          <section class="panel" aria-labelledby="act-h">
            <div class="panel-head between">
              <h2 id="act-h" class="section-title">Recent activity</h2>
              <a class="text-action" href={`${base}/activity`}><span>See all activity</span><Icon name="arrow-right" /></a>
            </div>
            <ActivityList activity={activity} user={user} />
          </section>
        </div>

        <MembersPanel {...props} />
      </div>
    </AppPage>
  );
}
