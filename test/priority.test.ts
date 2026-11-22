import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, newUser, orgWithProjectAndTask, pool } from './helpers.js';
import type { Fixture, TestUser } from './helpers.js';
import type { Task } from '../src/services/projects.js';

describe('task priority', () => {
  let alice: TestUser, bob: TestUser, A: Fixture, B: Fixture, tasksUrl: string;

  before(async () => {
    alice = await newUser('prio-alice');
    bob = await newUser('prio-bob');
    A = await orgWithProjectAndTask(alice, 'Prio A');
    B = await orgWithProjectAndTask(bob, 'Prio B');
    tasksUrl = `/api/orgs/${A.org.id}/projects/${A.project.id}/tasks`;
    await alice.as('post', tasksUrl).send({ title: 'Urgent fix', priority: 'high' }).expect(201);
    await alice.as('post', tasksUrl).send({ title: 'Someday', priority: 'low' }).expect(201);
    // Bob's org also has a high-priority task, which must never show up in Alice's filter.
    await bob.as('post', `/api/orgs/${B.org.id}/projects/${B.project.id}/tasks`).send({ title: 'Bob high', priority: 'high' }).expect(201);
  });
  after(() => pool.end());

  test('new tasks default to medium', () => {
    assert.equal(A.task.priority, 'medium');
  });

  test('tasks are listed high → medium → low', async () => {
    const { body } = await alice.as('get', tasksUrl).expect(200);
    assert.deepEqual(body.map((t: Task) => t.priority), ['high', 'medium', 'low']);
  });

  test('filtering by priority runs on the server and stays inside the org', async () => {
    const { body } = await alice.as('get', `${tasksUrl}?priority=high`).expect(200);
    assert.deepEqual(body.map((t: Task) => t.title), ['Urgent fix']);
  });

  test('an unknown priority is rejected by the API', async () => {
    const res = await alice.as('get', `${tasksUrl}?priority=urgent`).expect(400);
    assert.ok(res.body.details.priority);
    await alice.as('post', tasksUrl).send({ title: 'x', priority: 'urgent' }).expect(400);
  });

  test('priority can be changed', async () => {
    const { body } = await alice.as('patch', `/api/orgs/${A.org.id}/tasks/${A.task.id}`).send({ priority: 'low' }).expect(200);
    assert.equal(body.priority, 'low');
  });

  test('the web filter ignores an unknown value with a notice', async () => {
    const page = await request(app).get(`/orgs/${A.org.id}/projects/${A.project.id}?priority=urgent`)
      .set('Cookie', `token=${alice.token}`).expect(200);
    assert.ok(page.text.includes('Unknown priority “urgent” was ignored'));
    const high = await request(app).get(`/orgs/${A.org.id}/projects/${A.project.id}?priority=high`)
      .set('Cookie', `token=${alice.token}`).expect(200);
    assert.ok(high.text.includes('Urgent fix'));
    assert.ok(!high.text.includes('Someday'));
  });
});
