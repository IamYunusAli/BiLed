import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, newUser, orgWithProjectAndTask, pool } from './helpers.js';
import type { Fixture, TestUser } from './helpers.js';
import type { MyTaskGroup } from '../src/services/projects.js';
import type { AssignedTaskRow } from '../src/repositories/tasks.js';

describe('assignees, due dates and My tasks', () => {
  let alice: TestUser, hana: TestUser, bob: TestUser, A: Fixture, B: Fixture, baseA: string;

  before(async () => {
    alice = await newUser('as-alice');
    hana = await newUser('as-hana');
    bob = await newUser('as-bob');
    A = await orgWithProjectAndTask(alice, 'Assign A');
    B = await orgWithProjectAndTask(bob, 'Assign B');
    baseA = `/api/orgs/${A.org.id}`;
    const { body: inv } = await alice.as('post', `${baseA}/invites`).send({ role: 'member' }).expect(201);
    await hana.as('post', `/api/invites/${inv.token}/accept`).expect(201);
  });
  after(() => pool.end());

  test('a task can be assigned to a member with a due date', async () => {
    const { body } = await alice.as('post', `${baseA}/projects/${A.project.id}/tasks`)
      .send({ title: 'Wiring', assigneeId: hana.id, dueDate: '2026-12-31' }).expect(201);
    assert.equal(body.assignee_id, hana.id);
    assert.equal(body.due_date, '2026-12-31');
    assert.ok(body.assignee_name.startsWith('as-hana'));
  });

  test("a task can't be assigned to someone outside the org, even by id", async () => {
    const res = await alice.as('patch', `${baseA}/tasks/${A.task.id}`).send({ assigneeId: bob.id }).expect(400);
    assert.ok(res.body.details.assigneeId);
    // ...and the database refuses it too (composite FK to memberships of the SAME org)
    await assert.rejects(
      pool.query('UPDATE tasks SET assignee_id = $1 WHERE id = $2', [bob.id, A.task.id]),
      /tasks_assignee_membership_fk/,
    );
  });

  test('invalid dates are rejected; empty values clear the field', async () => {
    await alice.as('patch', `${baseA}/tasks/${A.task.id}`).send({ dueDate: '2026-02-30' }).expect(400);
    await alice.as('patch', `${baseA}/tasks/${A.task.id}`).send({ dueDate: '2026-03-01', assigneeId: alice.id }).expect(200);
    const { body } = await alice.as('patch', `${baseA}/tasks/${A.task.id}`).send({ dueDate: '', assigneeId: null }).expect(200);
    assert.equal(body.due_date, null);
    assert.equal(body.assignee_id, null);
  });

  test('My tasks lists only my assignments, across my orgs, and nothing from other orgs', async () => {
    await bob.as('patch', `/api/orgs/${B.org.id}/tasks/${B.task.id}`).send({ assigneeId: bob.id }).expect(200);
    const { body: hanaGroups } = await hana.as('get', '/api/me/tasks').expect(200);
    assert.deepEqual(hanaGroups.map((g: MyTaskGroup) => g.orgId), [A.org.id]);
    assert.ok(hanaGroups[0].tasks.every((t: AssignedTaskRow) => t.title === 'Wiring'));
    const { body: bobGroups } = await bob.as('get', '/api/me/tasks').expect(200);
    assert.deepEqual(bobGroups.map((g: MyTaskGroup) => g.orgId), [B.org.id]);
  });

  test('removing a member unassigns their tasks and drops them from My tasks', async () => {
    await alice.as('delete', `${baseA}/members/${hana.id}`).expect(204);
    const { rows } = await pool.query('SELECT assignee_id, org_id FROM tasks WHERE title = $1 AND org_id = $2', ['Wiring', A.org.id]);
    assert.equal(rows[0].assignee_id, null);
    assert.equal(rows[0].org_id, A.org.id); // ON DELETE SET NULL (assignee_id) keeps the tenant column
    const { body } = await hana.as('get', '/api/me/tasks').expect(200);
    assert.deepEqual(body, []);
  });

  test('the My tasks page renders', async () => {
    const page = await request(app).get('/my-tasks').set('Cookie', `token=${bob.token}`).expect(200);
    assert.ok(page.text.includes('Assign B'));
    assert.ok(!page.text.includes('Assign A'));
  });
});
