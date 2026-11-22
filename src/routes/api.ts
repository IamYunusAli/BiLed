import express from 'express';
import { currentUser, requireAuth } from '../middleware/authenticate.js';
import { loadMembership, requireAdmin, requireEditor, tenantOf } from '../middleware/tenant.js';
import { authLimiter } from '../middleware/rate-limit.js';
import { schemas, parse, parseId } from '../validation.js';
import { HttpError } from '../http-error.js';
import * as auth from '../services/auth.js';
import * as orgService from '../services/organizations.js';
import * as projectService from '../services/projects.js';
import * as inviteService from '../services/invites.js';
import * as activityService from '../services/activity.js';

export const apiRouter = express.Router();

// ---- Auth -------------------------------------------------------------------------------------
apiRouter.post('/auth/register', authLimiter, async (req, res) => {
  const { user, token } = await auth.register(parse(schemas.register, req.body));
  res.status(201).json({ user, token });
});

apiRouter.post('/auth/login', authLimiter, async (req, res) => {
  const { user, token } = await auth.login(parse(schemas.login, req.body));
  res.json({ user, token });
});

apiRouter.get('/me', requireAuth, (req, res) => res.json({ user: currentUser(req) }));

/** Tasks assigned to me, across every organization I belong to. */
apiRouter.get('/me/tasks', requireAuth, async (req, res) => res.json(await projectService.myTasks(currentUser(req).id)));

// ---- Invite links (the token in the link is the credential) -------------------------------
apiRouter.get('/invites/:token', async (req, res) => {
  const invite = await inviteService.lookup(req.params.token);
  if (!invite) throw new HttpError(404, 'This invite link is invalid or has expired');
  res.json({ org_name: invite.org_name, role: invite.role, invited_by: invite.inviter_name, expires_at: invite.expires_at });
});
apiRouter.post('/invites/:token/accept', requireAuth, async (req, res) => {
  const joined = await inviteService.accept(req.params.token, currentUser(req));
  res.status(joined.alreadyMember ? 200 : 201).json(joined);
});

// ---- Organizations I belong to --------------------------------------------------------------
apiRouter.get('/orgs', requireAuth, async (req, res) => {
  res.json(await orgService.listMine(currentUser(req).id));
});

apiRouter.post('/orgs', requireAuth, async (req, res) => {
  res.status(201).json(await orgService.create(currentUser(req), parse(schemas.org, req.body)));
});

// ---- Everything inside one organization ----------------------------------------------------
// requireAuth + loadMembership guard EVERY route below. Handlers use tenantOf(req) only.
const org = express.Router({ mergeParams: true });
apiRouter.use('/orgs/:orgId', requireAuth, loadMembership, org);

org.get('/', (req, res) => {
  const { orgId, orgName, role } = tenantOf(req);
  res.json({ id: orgId, name: orgName, role });
});
org.patch('/', requireAdmin, async (req, res) => {
  res.json(await orgService.rename(tenantOf(req), parse(schemas.org, req.body)));
});

org.get('/activity', async (req, res) => res.json(await activityService.list(tenantOf(req), { limit: 100 })));

// Members
org.get('/members', async (req, res) => res.json(await orgService.listMembers(tenantOf(req))));
org.post('/members', requireAdmin, async (req, res) => {
  res.status(201).json(await orgService.addMember(tenantOf(req), parse(schemas.addMember, req.body)));
});
org.patch('/members/:userId', requireAdmin, async (req, res) => {
  await orgService.changeRole(tenantOf(req), parseId(req.params.userId), parse(schemas.changeRole, req.body));
  res.json(await orgService.listMembers(tenantOf(req)));
});
org.delete('/members/:userId', requireAdmin, async (req, res) => {
  await orgService.removeMember(tenantOf(req), parseId(req.params.userId));
  res.status(204).end();
});

// Invites (admin). The plain token is returned once, at creation; only its hash is stored.
org.get('/invites', requireAdmin, async (req, res) => res.json(await inviteService.listPending(tenantOf(req))));
org.post('/invites', requireAdmin, async (req, res) => {
  const invite = await inviteService.create(tenantOf(req), parse(schemas.changeRole, req.body));
  res.status(201).json({ ...invite, url: `${req.protocol}://${req.get('host')}/join/${invite.token}` });
});
org.delete('/invites/:inviteId', requireAdmin, async (req, res) => {
  await inviteService.revoke(tenantOf(req), parseId(req.params.inviteId));
  res.status(204).end();
});

// Projects (read: anyone in the org; write: admin)
org.get('/projects', async (req, res) => res.json(await projectService.list(tenantOf(req))));
org.post('/projects', requireAdmin, async (req, res) => {
  res.status(201).json(await projectService.create(tenantOf(req), parse(schemas.project, req.body)));
});
org.get('/projects/:projectId', async (req, res) => {
  res.json(await projectService.get(tenantOf(req), parseId(req.params.projectId)));
});
org.patch('/projects/:projectId', requireAdmin, async (req, res) => {
  res.json(await projectService.update(tenantOf(req), parseId(req.params.projectId), parse(schemas.projectPatch, req.body)));
});
org.delete('/projects/:projectId', requireAdmin, async (req, res) => {
  await projectService.remove(tenantOf(req), parseId(req.params.projectId));
  res.status(204).end();
});

// Tasks (read: anyone in the org; write: admins and members, not viewers)
org.get('/projects/:projectId/tasks', async (req, res) => {
  const { priority } = parse(schemas.taskFilter, req.query); // invalid priority -> 400
  res.json(await projectService.listTasks(tenantOf(req), parseId(req.params.projectId), { priority }));
});
org.post('/projects/:projectId/tasks', requireEditor, async (req, res) => {
  const task = await projectService.createTask(tenantOf(req), parseId(req.params.projectId), parse(schemas.task, req.body));
  res.status(201).json(task);
});
org.get('/tasks/:taskId', async (req, res) => {
  res.json(await projectService.getTask(tenantOf(req), parseId(req.params.taskId)));
});
org.patch('/tasks/:taskId', requireEditor, async (req, res) => {
  res.json(await projectService.updateTask(tenantOf(req), parseId(req.params.taskId), parse(schemas.taskPatch, req.body)));
});
org.delete('/tasks/:taskId', requireEditor, async (req, res) => {
  await projectService.removeTask(tenantOf(req), parseId(req.params.taskId));
  res.status(204).end();
});
