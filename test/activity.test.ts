import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { newUser, orgWithProjectAndTask, pool } from './helpers.js';
import type { Fixture, TestUser } from './helpers.js';
import type { ActivityRow } from '../src/repositories/activity.js';

describe('activity log', () => {
  let alice: TestUser, bob: TestUser, A: Fixture, base: string;

  before(async () => {
    alice = await newUser('act-alice');
    bob = await newUser('act-bob');
    A = await orgWithProjectAndTask(alice, 'Activity Org');
    await orgWithProjectAndTask(bob, 'Other Activity Org');
    base = `/api/orgs/${A.org.id}`;
  });
  after(() => pool.end());

  test('creating the org, project and task is recorded, newest first, with the actor', async () => {
    const { body } = await alice.as('get', `${base}/activity`).expect(200);
    assert.deepEqual(body.map((a: ActivityRow) => a.action), ['task.created', 'project.created', 'org.created']);
    assert.ok(body.every((a: ActivityRow) => a.actor_id === alice.id));
  });

  test('budget and task changes are described in the entry', async () => {
    await alice.as('patch', `${base}/projects/${A.project.id}`).send({ budget: '2500' }).expect(200);
    await alice.as('patch', `${base}/tasks/${A.task.id}`).send({ status: 'done', actualCost: '120' }).expect(200);
    const { body } = await alice.as('get', `${base}/activity`).expect(200);
    assert.match(body[0].summary, /status To do → Done/);
    assert.match(body[0].summary, /actual cost not recorded → ETB\s120\.00/);
    assert.match(body[1].summary, /budget from ETB\s1,000\.00 to ETB\s2,500\.00/);
  });

  test('an outsider cannot read the activity of another org', async () => {
    await bob.as('get', `${base}/activity`).expect(404);
    const { body } = await bob.as('get', '/api/orgs').expect(200);
    const bobOrg = body[0].id;
    const { body: bobActivity } = await bob.as('get', `/api/orgs/${bobOrg}/activity`).expect(200);
    assert.ok(bobActivity.length > 0);
    assert.ok(bobActivity.every((a: ActivityRow) => a.actor_id === bob.id), "Bob's org activity must contain only Bob's actions");
  });

  test('the log is append-only', async () => {
    await assert.rejects(
      pool.query(`UPDATE activity SET summary = 'tampered' WHERE org_id = $1`, [A.org.id]),
      /append-only/,
    );
  });

  test('a failed change writes no entry (same transaction)', async () => {
    const before = (await alice.as('get', `${base}/activity`)).body.length;
    await alice.as('patch', `${base}/tasks/${A.task.id}`).send({ assigneeId: bob.id }).expect(400);
    const afterCount = (await alice.as('get', `${base}/activity`)).body.length;
    assert.equal(afterCount, before);
  });
});
