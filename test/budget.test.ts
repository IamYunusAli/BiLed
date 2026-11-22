import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { newUser, pool } from './helpers.js';
import type { TestUser } from './helpers.js';
import { etbToSantim, formatEtb } from '../src/money.js';

describe('ETB money handling', () => {
  test('ETB strings convert to integer santim exactly', () => {
    assert.equal(etbToSantim('1234.56'), 123456);
    assert.equal(etbToSantim('1,500.5'), 150050);
    assert.equal(etbToSantim(0.1), 10);
    assert.equal(etbToSantim('450000'), 45000000);
    for (const bad of ['-1', '1.234', 'abc', '', '1e5']) assert.throws(() => etbToSantim(bad), bad);
  });

  test('formats as Ethiopian Birr', () => {
    // Intl separates the currency code with a non-breaking space; normalise it for the comparison.
    assert.equal(formatEtb(39500050).replace(/\s/g, ' '), 'ETB 395,000.50');
  });
});

describe('budget vs spent per project', () => {
  let owner: TestUser, orgId: string, projectId: string;
  before(async () => {
    owner = await newUser('budget');
    orgId = (await owner.as('post', '/api/orgs').send({ name: 'Budget Org' }).expect(201)).body.id;
    projectId = (await owner.as('post', `/api/orgs/${orgId}/projects`).send({ name: 'Build', budget: '1000.00' }).expect(201)).body.id;
  });
  after(() => pool.end());

  const project = async () => (await owner.as('get', `/api/orgs/${orgId}/projects/${projectId}`).expect(200)).body;
  const addTask = (cost: string, status = 'todo') =>
    owner.as('post', `/api/orgs/${orgId}/projects/${projectId}/tasks`).send({ title: `t ${cost}`, estimatedCost: cost, status }).expect(201);

  test('a new project has nothing spent', async () => {
    const p = await project();
    assert.equal(p.spent_santim, 0);
    assert.equal(p.remaining_etb, '1000.00');
    assert.equal(p.over_budget, false);
  });

  test('spent is the sum of task estimates; done is tracked separately', async () => {
    await addTask('300.25', 'done');
    await addTask('199.75');
    const p = await project();
    assert.equal(p.spent_etb, '500.00');
    assert.equal(p.done_etb, '300.25');
    assert.equal(p.percent_used, 50);
  });

  test('going over budget is flagged', async () => {
    await addTask('600');
    const p = await project();
    assert.equal(p.over_budget, true);
    assert.equal(p.remaining_etb, '-100.00');
  });

  test('status: at risk when committed exceeds the budget, overrun when actual spend does', async () => {
    let p = await project();
    assert.equal(p.status, 'at_risk'); // committed 1,100 > budget 1,000, nothing actually spent
    const { body: tasks } = await owner.as('get', `/api/orgs/${orgId}/projects/${projectId}/tasks`).expect(200);
    await owner.as('patch', `/api/orgs/${orgId}/tasks/${tasks[0].id}`).send({ actualCost: '400' }).expect(200);
    p = await project();
    assert.equal(p.actual_etb, '400.00');
    assert.equal(p.status, 'at_risk');
    await owner.as('patch', `/api/orgs/${orgId}/tasks/${tasks[1].id}`).send({ actualCost: '700' }).expect(200);
    p = await project();
    assert.equal(p.actual_etb, '1100.00');
    assert.equal(p.status, 'overrun');
    await owner.as('patch', `/api/orgs/${orgId}/projects/${projectId}`).send({ budget: '5000' }).expect(200);
    assert.equal((await project()).status, 'on_track');
  });

  test('negative or malformed amounts are rejected', async () => {
    await owner.as('post', `/api/orgs/${orgId}/projects/${projectId}/tasks`).send({ title: 'bad', estimatedCost: '-5' }).expect(400);
    await owner.as('post', `/api/orgs/${orgId}/projects`).send({ name: 'bad', budget: '12.345' }).expect(400);
  });
});
