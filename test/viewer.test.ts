import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, newUser, orgWithProjectAndTask, pool } from './helpers.js';
import type { Fixture, TestUser } from './helpers.js';

describe('viewer role (read-only)', () => {
  let admin: TestUser, viewer: TestUser, O: Fixture, base: string;

  before(async () => {
    admin = await newUser('v-admin');
    viewer = await newUser('v-viewer');
    O = await orgWithProjectAndTask(admin, 'Viewer Org');
    base = `/api/orgs/${O.org.id}`;
    const { body: inv } = await admin.as('post', `${base}/invites`).send({ role: 'viewer' }).expect(201);
    await viewer.as('post', `/api/invites/${inv.token}/accept`).expect(201);
  });
  after(() => pool.end());

  test('a viewer can read the org, projects, tasks, members and activity', async () => {
    const { body: org } = await viewer.as('get', base).expect(200);
    assert.equal(org.role, 'viewer');
    await viewer.as('get', `${base}/projects`).expect(200);
    await viewer.as('get', `${base}/projects/${O.project.id}/tasks`).expect(200);
    await viewer.as('get', `${base}/tasks/${O.task.id}`).expect(200);
    await viewer.as('get', `${base}/members`).expect(200);
    await viewer.as('get', `${base}/activity`).expect(200);
  });

  test('a viewer cannot change tasks, projects, members or invites (403)', async () => {
    await viewer.as('post', `${base}/projects/${O.project.id}/tasks`).send({ title: 'nope' }).expect(403);
    await viewer.as('patch', `${base}/tasks/${O.task.id}`).send({ status: 'done' }).expect(403);
    await viewer.as('delete', `${base}/tasks/${O.task.id}`).expect(403);
    await viewer.as('post', `${base}/projects`).send({ name: 'x', budget: '1' }).expect(403);
    await viewer.as('get', `${base}/invites`).expect(403);
    await viewer.as('post', `${base}/invites`).send({ role: 'admin' }).expect(403);
    const { rows } = await pool.query('SELECT status FROM tasks WHERE id = $1', [O.task.id]);
    assert.equal(rows[0].status, 'todo');
  });

  test('a viewer cannot be assigned a task', async () => {
    const res = await admin.as('patch', `${base}/tasks/${O.task.id}`).send({ assigneeId: viewer.id }).expect(400);
    assert.ok(res.body.details.assigneeId);
  });

  test('demoting a member to viewer unassigns their tasks', async () => {
    const worker = await newUser('v-worker');
    const { body: inv } = await admin.as('post', `${base}/invites`).send({ role: 'member' }).expect(201);
    await worker.as('post', `/api/invites/${inv.token}/accept`).expect(201);
    await admin.as('patch', `${base}/tasks/${O.task.id}`).send({ assigneeId: worker.id }).expect(200);
    await admin.as('patch', `${base}/members/${worker.id}`).send({ role: 'viewer' }).expect(200);
    const { body } = await admin.as('get', `${base}/tasks/${O.task.id}`).expect(200);
    assert.equal(body.assignee_id, null);
  });

  test('the project page shows viewers a read-only panel and no edit controls', async () => {
    const page = await request(app).get(`/orgs/${O.org.id}/projects/${O.project.id}`).set('Cookie', `token=${viewer.token}`).expect(200);
    assert.ok(page.text.includes('Read-only access'));
    assert.ok(!page.text.includes('Add task</h2>'));
    assert.ok(!page.text.includes('/delete'));
  });
});
