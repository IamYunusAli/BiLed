import express, { type Request, type Response } from 'express';
import { currentUser, requireAuth } from '../middleware/authenticate.js';
import { loadMembership, requireAdmin, requireEditor, tenantOf } from '../middleware/tenant.js';
import { authLimiter } from '../middleware/rate-limit.js';
import { cookieOptions, COOKIE_NAME } from '../auth/jwt.js';
import { HttpError } from '../http-error.js';
import { schemas, parse, parseId, PRIORITIES } from '../validation.js';
import * as auth from '../services/auth.js';
import * as orgService from '../services/organizations.js';
import * as projectService from '../services/projects.js';
import * as inviteService from '../services/invites.js';
import * as activityService from '../services/activity.js';
import type { CreatedInvite, PendingInvite } from '../repositories/invites.js';
import type { MemberRow } from '../repositories/memberships.js';
import type { Priority, Tenant, User } from '../domain.js';
import { todayInAddis } from '../labels.js';
import { pageContext, render, tenantContext, userContext, type FormState } from '../views/context.js';
import { LoginPage, RegisterPage, type InviteContext } from '../views/pages/auth.js';
import { JoinPage } from '../views/pages/join.js';
import { OrgsPage, WelcomePage } from '../views/pages/orgs.js';
import { OrgPage, setupSteps, type Setup } from '../views/pages/org.js';
import { ActivityPage, MyTasksPage } from '../views/pages/misc.js';
import { ProjectEditPage, ProjectPage, TaskEditPage } from '../views/pages/project.js';

// Server-rendered pages. They call exactly the same services as the JSON API, so the tenant
// checks live in one place. GET routes never change data; mutations are POST forms.

export const webRouter = express.Router();

/** What a page is (re-)rendered with: a failed form's state, or a just-created invite link. */
type Locals = FormState & { createdInvite?: CreatedInvite & { token: string; url: string } };
type Render = (req: Request, res: Response, locals?: Locals) => Promise<void>;

// Fixed success messages, selected by a code in the query string (no user text is reflected).
const NOTICES: Record<string, string> = {
  'org-created': 'Organization created. You are its admin.',
  'org-renamed': 'Organization renamed.',
  'member-updated': 'Member role updated.',
  'member-removed': 'Member removed.',
  'invite-revoked': 'Invite link revoked. It no longer works.',
  'already-member': 'You are already a member of this organization.',
  'project-created': 'Project created.',
  'project-updated': 'Project updated.',
  'project-deleted': 'Project deleted.',
  'task-created': 'Task added.',
  'task-updated': 'Task updated.',
  'task-deleted': 'Task deleted.',
};

/** A single string query parameter, or undefined (arrays and nested objects are ignored). */
const queryString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

webRouter.use(async (req, res, next) => {
  const ok = queryString(req.query.ok);
  res.locals.notice = (ok && NOTICES[ok]) ?? null;
  res.locals.tenant = undefined;
  res.locals.currentPath = req.path;
  // The header's organization switcher lists only the orgs this user belongs to.
  res.locals.myOrgs = req.user ? await orgService.listMine(req.user.id) : [];
  next();
});

/** HTML forms send "" for empty inputs; treat those optional fields as "not provided". */
function blanksToUndefined(body: unknown, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...((body ?? {}) as Record<string, unknown>) };
  for (const k of keys) if (out[k] === '') delete out[k];
  return out;
}

/** Only well-formed invite tokens are carried between pages (never arbitrary redirect targets). */
const inviteParam = (value: unknown): string | null =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;

/** Runs a form action; on a 400/404/409 re-renders the page with the errors instead of failing. */
const form =
  (action: (req: Request, res: Response) => Promise<unknown>, rerender?: Render) =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      await action(req, res);
    } catch (err) {
      if (err instanceof HttpError && [400, 404, 409].includes(err.status) && rerender) {
        res.status(err.status);
        return rerender(req, res, { errors: err.details ?? {}, values: req.body ?? {}, formError: err.message });
      }
      throw err;
    }
  };

function signIn(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

/** After login/registration with an invite: join the org and land on it. */
async function finishWithInvite(res: Response, invite: string, user: User): Promise<void> {
  try {
    const joined = await inviteService.accept(invite, user);
    return res.redirect(303, `/orgs/${joined.orgId}?ok=${joined.alreadyMember ? 'already-member' : 'joined'}`);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return res.redirect(303, `/join/${invite}`); // shows "expired"
    throw err;
  }
}

// ---- Public pages -----------------------------------------------------------------------------
webRouter.get('/', (req, res) => res.redirect(303, req.user ? '/orgs' : '/login'));

async function inviteContext(token: string | null): Promise<InviteContext | null> {
  if (!token) return null;
  const invite = await inviteService.lookup(token);
  return invite ? { token, orgName: invite.org_name, role: invite.role } : null;
}

const renderLogin: Render = async (req, res, locals = {}) => {
  const invite = await inviteContext(inviteParam(req.query.invite ?? req.body?.invite));
  render(res, LoginPage({ ctx: pageContext(res, locals), invite }));
};
const renderRegister: Render = async (req, res, locals = {}) => {
  const invite = await inviteContext(inviteParam(req.query.invite ?? req.body?.invite));
  render(res, RegisterPage({ ctx: pageContext(res, locals), invite }));
};

webRouter.get('/login', (req, res) => (req.user ? res.redirect(303, '/orgs') : renderLogin(req, res)));
webRouter.get('/register', (req, res) => (req.user ? res.redirect(303, '/orgs') : renderRegister(req, res)));

webRouter.post('/login', authLimiter, async (req, res) => {
  try {
    const { user, token } = await auth.login(parse(schemas.login, req.body));
    signIn(res, token);
    const invite = inviteParam(req.body?.invite);
    if (invite) return finishWithInvite(res, invite, user);
    res.redirect(303, '/orgs');
  } catch (err) {
    if (!(err instanceof HttpError) || err.status >= 500) throw err;
    res.status(err.status);
    await renderLogin(req, res, { values: { email: req.body?.email }, errors: err.details ?? {}, formError: err.message });
  }
});

webRouter.post(
  '/register',
  authLimiter,
  form(
    async (req, res) => {
      const { user, token } = await auth.register(parse(schemas.register, req.body));
      signIn(res, token);
      const invite = inviteParam(req.body?.invite);
      if (invite) return finishWithInvite(res, invite, user);
      res.redirect(303, '/orgs');
    },
    (req, res, locals) => renderRegister(req, res, { ...locals, values: { name: req.body?.name, email: req.body?.email } }),
  ),
);

webRouter.post('/logout', (req, res) => {
  const { maxAge: _m, ...opts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, opts);
  const invite = inviteParam(req.body?.invite); // "Use another account" on the join page
  res.redirect(303, invite ? `/login?invite=${invite}` : '/login');
});

// ---- Invite links -----------------------------------------------------------------------------
webRouter.get('/join/:token', async (req, res) => {
  const token = inviteParam(req.params.token);
  const invite = token ? await inviteService.lookup(token) : null;
  render(res.status(invite ? 200 : 404), JoinPage({ ctx: pageContext(res), invite, token }));
});

webRouter.post('/join/:token', requireAuth, async (req, res) => {
  const token = inviteParam(req.params.token);
  if (!token) throw new HttpError(404, 'This invite link is invalid or has expired');
  return finishWithInvite(res, token, currentUser(req));
});

// ---- My organizations -------------------------------------------------------------------------
const renderOrgList: Render = async (req, res, locals = {}) => {
  const orgs = await orgService.listMine(currentUser(req).id);
  if (orgs.length === 0) return render(res, WelcomePage({ ctx: userContext(res, locals) }));
  render(res, OrgsPage({ ctx: userContext(res, locals), orgs }));
};

webRouter.get('/orgs', requireAuth, (req, res) => renderOrgList(req, res));
webRouter.post(
  '/orgs',
  requireAuth,
  form(async (req, res) => {
    const created = await orgService.create(currentUser(req), parse(schemas.org, req.body));
    res.redirect(303, `/orgs/${created.id}?ok=org-created`);
  }, renderOrgList),
);

// ---- My tasks (across all my organizations) ---------------------------------------------------
webRouter.get('/my-tasks', requireAuth, async (req, res) => {
  const groups = await projectService.myTasks(currentUser(req).id);
  render(res, MyTasksPage({ ctx: userContext(res), groups, today: todayInAddis() }));
});

// ---- Inside one organization ------------------------------------------------------------------
const org = express.Router({ mergeParams: true });
webRouter.use('/orgs/:orgId', requireAuth, loadMembership, org);

org.use((req, res, next) => {
  res.locals.tenant = tenantOf(req);
  next();
});

const renderOrg: Render = async (req, res, locals = {}) => {
  const tenant = tenantOf(req);
  const [projects, members, activity] = await Promise.all([
    projectService.list(tenant),
    orgService.listMembers(tenant),
    activityService.list(tenant, { limit: 8 }),
  ]);
  let invites: PendingInvite[] = [];
  let setup: Setup | null = null;
  if (tenant.isAdmin) {
    const [pending, created] = await Promise.all([inviteService.listPending(tenant), inviteService.countCreated(tenant)]);
    invites = pending;
    setup = setupSteps(projects, members, created);
  }
  const adminCount = members.filter((m) => m.role === 'admin').length;
  render(res, OrgPage({
    ctx: tenantContext(res, locals),
    projects,
    members,
    adminCount,
    invites,
    setup,
    activity,
    justJoined: req.query.ok === 'joined',
    createdInvite: locals.createdInvite ?? null,
  }));
};

org.get('/', (req, res) => renderOrg(req, res));

org.get('/activity', async (req, res) => {
  const tenant = tenantOf(req);
  const activity = await activityService.list(tenant, { limit: 200 });
  render(res, ActivityPage({ ctx: tenantContext(res), activity }));
});

org.post('/rename', requireAdmin, form(async (req, res) => {
  const tenant = tenantOf(req);
  await orgService.rename(tenant, parse(schemas.org, req.body));
  res.redirect(303, `/orgs/${tenant.orgId}?ok=org-renamed`);
}, renderOrg));

// The new link is shown exactly once, so this renders instead of redirecting (the token is not stored).
org.post('/invites', requireAdmin, form(async (req, res) => {
  const { role } = parse(schemas.changeRole, req.body);
  const invite = await inviteService.create(tenantOf(req), { role });
  const url = `${req.protocol}://${req.get('host')}/join/${invite.token}`;
  res.status(201);
  await renderOrg(req, res, { createdInvite: { ...invite, url } });
}, renderOrg));

org.post('/invites/:inviteId/revoke', requireAdmin, form(async (req, res) => {
  const tenant = tenantOf(req);
  await inviteService.revoke(tenant, parseId(req.params.inviteId));
  res.redirect(303, `/orgs/${tenant.orgId}?ok=invite-revoked`);
}, renderOrg));

org.post('/members/:userId/role', requireAdmin, form(async (req, res) => {
  const tenant = tenantOf(req);
  await orgService.changeRole(tenant, parseId(req.params.userId), parse(schemas.changeRole, req.body));
  res.redirect(303, `/orgs/${tenant.orgId}?ok=member-updated`);
}, renderOrg));

org.post('/members/:userId/remove', requireAdmin, form(async (req, res) => {
  const tenant = tenantOf(req);
  const userId = parseId(req.params.userId);
  await orgService.removeMember(tenant, userId);
  // Removing yourself means you no longer have access to this org.
  res.redirect(303, userId === tenant.userId ? '/orgs' : `/orgs/${tenant.orgId}?ok=member-removed`);
}, renderOrg));

org.post('/projects', requireAdmin, form(async (req, res) => {
  const tenant = tenantOf(req);
  const project = await projectService.create(tenant, parse(schemas.project, req.body));
  res.redirect(303, `/orgs/${tenant.orgId}/projects/${project.id}?ok=project-created`);
}, renderOrg));

// ---- Project page -----------------------------------------------------------------------------

/** Members who can be assigned tasks (admins and members; viewers are read-only). */
async function assignableMembers(tenant: Tenant): Promise<MemberRow[]> {
  return (await orgService.listMembers(tenant)).filter((m) => m.role !== 'viewer');
}

const isPriority = (value: string | undefined): value is Priority =>
  value !== undefined && (PRIORITIES as readonly string[]).includes(value);

const renderProject: Render = async (req, res, locals = {}) => {
  const tenant = tenantOf(req);
  const projectId = parseId(req.params.projectId);
  // ?priority= filters in SQL. An unknown value is ignored with a notice (the API returns 400).
  const raw = queryString(req.query.priority);
  const priority = isPriority(raw) ? raw : undefined;
  const ignoredPriority = raw && raw !== 'all' && !priority ? raw.slice(0, 24) : null;
  const [project, tasks, counts, assignees] = await Promise.all([
    projectService.get(tenant, projectId),
    projectService.listTasks(tenant, projectId, { priority }),
    projectService.priorityCounts(tenant, projectId),
    tenant.canEdit ? assignableMembers(tenant) : Promise.resolve([]),
  ]);
  const shownTotal = tasks.reduce((sum, t) => sum + t.estimated_cost_santim, 0);
  const shownActual = tasks.reduce((sum, t) => sum + (t.actual_cost_santim ?? 0), 0);
  render(res, ProjectPage({
    ctx: tenantContext(res, locals),
    project,
    tasks,
    counts,
    priority: priority ?? 'all',
    ignoredPriority,
    shownTotal,
    shownActual,
    assignees,
    today: todayInAddis(),
  }));
};

org.get('/projects/:projectId', (req, res) => renderProject(req, res));

const renderProjectEdit: Render = async (req, res, locals = {}) => {
  const project = await projectService.get(tenantOf(req), parseId(req.params.projectId));
  render(res, ProjectEditPage({ ctx: tenantContext(res, locals), project }));
};

org.get('/projects/:projectId/edit', requireAdmin, (req, res) => renderProjectEdit(req, res));
org.post('/projects/:projectId/edit', requireAdmin, form(async (req, res) => {
  const tenant = tenantOf(req);
  const projectId = parseId(req.params.projectId);
  await projectService.update(tenant, projectId, parse(schemas.project, req.body));
  res.redirect(303, `/orgs/${tenant.orgId}/projects/${projectId}?ok=project-updated`);
}, renderProjectEdit));

org.post('/projects/:projectId/delete', requireAdmin, async (req, res) => {
  const tenant = tenantOf(req);
  await projectService.remove(tenant, parseId(req.params.projectId));
  res.redirect(303, `/orgs/${tenant.orgId}?ok=project-deleted`);
});

org.post('/projects/:projectId/tasks', requireEditor, form(async (req, res) => {
  const tenant = tenantOf(req);
  const projectId = parseId(req.params.projectId);
  await projectService.createTask(tenant, projectId, parse(schemas.task, blanksToUndefined(req.body, ['estimatedCost'])));
  res.redirect(303, `/orgs/${tenant.orgId}/projects/${projectId}?ok=task-created`);
}, renderProject));

// ---- Task edit --------------------------------------------------------------------------------
const renderTaskEdit: Render = async (req, res, locals = {}) => {
  const tenant = tenantOf(req);
  const task = await projectService.getTask(tenant, parseId(req.params.taskId));
  const [project, assignees] = await Promise.all([projectService.get(tenant, task.project_id), assignableMembers(tenant)]);
  render(res, TaskEditPage({ ctx: tenantContext(res, locals), task, project, assignees }));
};

org.get('/tasks/:taskId/edit', requireEditor, (req, res) => renderTaskEdit(req, res));
org.post('/tasks/:taskId/edit', requireEditor, form(async (req, res) => {
  const tenant = tenantOf(req);
  const task = await projectService.updateTask(
    tenant,
    parseId(req.params.taskId),
    parse(schemas.task, blanksToUndefined(req.body, ['estimatedCost'])),
  );
  res.redirect(303, `/orgs/${tenant.orgId}/projects/${task.project_id}?ok=task-updated`);
}, renderTaskEdit));

org.post('/tasks/:taskId/delete', requireEditor, async (req, res) => {
  const tenant = tenantOf(req);
  const projectId = await projectService.removeTask(tenant, parseId(req.params.taskId));
  res.redirect(303, `/orgs/${tenant.orgId}/projects/${projectId}?ok=task-deleted`);
});
