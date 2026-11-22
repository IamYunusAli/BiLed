// The core guarantee: a user only ever sees and changes data of organizations they belong to.
// Alice owns Org A, Bob owns Org B. Every probe is Bob trying to reach Org A's data.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, newUser, orgWithProjectAndTask, pool } from './helpers.js';
import type { Fixture, TestUser } from './helpers.js';
import type { MyOrgRow } from '../src/repositories/organizations.js';
import type { Project } from '../src/services/projects.js';

describe('tenant isolation', () => {
  let alice: TestUser, bob: TestUser, A: Fixture, B: Fixture;

  before(async () => {
    alice = await newUser('alice');
    bob = await newUser('bob');
    A = await orgWithProjectAndTask(alice, 'Org A');
    B = await orgWithProjectAndTask(bob, 'Org B');
  });
  after(() => pool.end());

  test('organization list contains only my organizations', async () => {
    const { body } = await bob.as('get', '/api/orgs').expect(200);
    assert.deepEqual(body.map((o: MyOrgRow) => o.id), [B.org.id]);
  });

  test("cannot read another organization's org, projects, tasks or members", async () => {
    const urls = [
      `/api/orgs/${A.org.id}`,
      `/api/orgs/${A.org.id}/members`,
      `/api/orgs/${A.org.id}/projects`,
      `/api/orgs/${A.org.id}/projects/${A.project.id}`,
      `/api/orgs/${A.org.id}/projects/${A.project.id}/tasks`,
      `/api/orgs/${A.org.id}/tasks/${A.task.id}`,
      // ID-swap attacks: my own org in the URL, the other tenant's resource id
      `/api/orgs/${B.org.id}/projects/${A.project.id}`,
      `/api/orgs/${B.org.id}/projects/${A.project.id}/tasks`,
      `/api/orgs/${B.org.id}/tasks/${A.task.id}`,
    ];
    for (const url of urls) {
      const res = await bob.as('get', url);
      assert.equal(res.status, 404, `expected 404 for GET ${url}, got ${res.status}`);
      assert.ok(!JSON.stringify(res.body).includes('Org A'), `response for ${url} leaked Org A data`);
    }
  });

  test("cannot update or delete another organization's task, via either URL", async () => {
    for (const orgId of [A.org.id, B.org.id]) {
      await bob.as('patch', `/api/orgs/${orgId}/tasks/${A.task.id}`).send({ title: 'pwned' }).expect(404);
      await bob.as('delete', `/api/orgs/${orgId}/tasks/${A.task.id}`).expect(404);
    }
    const { rows } = await pool.query('SELECT title FROM tasks WHERE id = $1', [A.task.id]);
    assert.equal(rows[0].title, 'Org A task', 'task must be unchanged in the database');
  });

  test("cannot update or delete another organization's project", async () => {
    for (const orgId of [A.org.id, B.org.id]) {
      await bob.as('patch', `/api/orgs/${orgId}/projects/${A.project.id}`).send({ budget: '1' }).expect(404);
      await bob.as('delete', `/api/orgs/${orgId}/projects/${A.project.id}`).expect(404);
    }
    const { rows } = await pool.query('SELECT budget_santim FROM projects WHERE id = $1', [A.project.id]);
    assert.equal(rows[0].budget_santim, 100000);
  });

  test("cannot create a task inside another organization's project", async () => {
    await bob.as('post', `/api/orgs/${A.org.id}/projects/${A.project.id}/tasks`).send({ title: 'x' }).expect(404);
    await bob.as('post', `/api/orgs/${B.org.id}/projects/${A.project.id}/tasks`).send({ title: 'x' }).expect(404);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM tasks WHERE project_id = $1', [A.project.id]);
    assert.equal(rows[0].n, 1);
  });

  test('an org id smuggled in the request body is ignored', async () => {
    await bob
      .as('post', `/api/orgs/${B.org.id}/projects`)
      .send({ name: 'sneaky', budget: '1', org_id: A.org.id, orgId: A.org.id })
      .expect(201);
    const { body } = await alice.as('get', `/api/orgs/${A.org.id}/projects`).expect(200);
    assert.ok(!body.some((p: Project) => p.name === 'sneaky'));
  });

  test('cannot add yourself to another organization', async () => {
    await bob.as('post', `/api/orgs/${A.org.id}/members`).send({ email: bob.email, role: 'admin' }).expect(404);
    const { rows } = await pool.query('SELECT 1 FROM memberships WHERE org_id = $1 AND user_id = $2', [A.org.id, bob.id]);
    assert.equal(rows.length, 0);
  });

  test('budget totals only count tasks of the same organization', async () => {
    const { body } = await alice.as('get', `/api/orgs/${A.org.id}/projects/${A.project.id}`).expect(200);
    assert.equal(body.spent_santim, 10000); // only Org A's ETB 100 task
  });

  test('the web pages enforce the same boundary', async () => {
    const page = await request(app).get(`/orgs/${A.org.id}`).set('Cookie', `token=${bob.token}`);
    assert.equal(page.status, 404);
    assert.ok(!page.text.includes('Org A'));
    const own = await request(app).get(`/orgs/${B.org.id}`).set('Cookie', `token=${bob.token}`).expect(200);
    assert.ok(own.text.includes('Org B'));
  });

  test('a removed member loses access immediately, with the same token', async () => {
    await alice.as('post', `/api/orgs/${A.org.id}/members`).send({ email: bob.email, role: 'member' }).expect(201);
    await bob.as('get', `/api/orgs/${A.org.id}/projects`).expect(200);
    await alice.as('delete', `/api/orgs/${A.org.id}/members/${bob.id}`).expect(204);
    await bob.as('get', `/api/orgs/${A.org.id}/projects`).expect(404);
  });

  test('malformed ids are treated as not found', async () => {
    await bob.as('get', '/api/orgs/not-a-uuid/projects').expect(404);
    await bob.as('get', `/api/orgs/${B.org.id}/tasks/123`).expect(404);
  });
});
