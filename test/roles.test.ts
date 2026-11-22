import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { newUser, orgWithProjectAndTask, pool } from './helpers.js';
import type { Fixture, TestUser } from './helpers.js';
import type { MemberRow } from '../src/repositories/memberships.js';
import type { MyOrgRow } from '../src/repositories/organizations.js';

describe('roles inside an organization', () => {
  let admin: TestUser, member: TestUser, outsider: TestUser, O: Fixture;

  before(async () => {
    admin = await newUser('admin');
    member = await newUser('member');
    outsider = await newUser('outsider');
    O = await orgWithProjectAndTask(admin, 'Roles Org');
    await admin.as('post', `/api/orgs/${O.org.id}/members`).send({ email: member.email, role: 'member' }).expect(201);
  });
  after(() => pool.end());

  test('the creator is admin; an added member has the member role', async () => {
    const { body } = await admin.as('get', `/api/orgs/${O.org.id}/members`).expect(200);
    const roleOf = (id: string) => body.find((m: MemberRow) => m.user_id === id)?.role;
    assert.equal(roleOf(admin.id), 'admin');
    assert.equal(roleOf(member.id), 'member');
  });

  test('a user can belong to several organizations with different roles', async () => {
    const other = (await member.as('post', '/api/orgs').send({ name: 'Member-owned' }).expect(201)).body;
    const { body } = await member.as('get', '/api/orgs').expect(200);
    const roles = Object.fromEntries(body.map((o: MyOrgRow) => [o.id, o.role]));
    assert.equal(roles[O.org.id], 'member');
    assert.equal(roles[other.id], 'admin');
  });

  test('members can read projects and work on tasks', async () => {
    await member.as('get', `/api/orgs/${O.org.id}/projects`).expect(200);
    const t = (
      await member.as('post', `/api/orgs/${O.org.id}/projects/${O.project.id}/tasks`).send({ title: 'By member' }).expect(201)
    ).body;
    await member.as('patch', `/api/orgs/${O.org.id}/tasks/${t.id}`).send({ status: 'done' }).expect(200);
    await member.as('delete', `/api/orgs/${O.org.id}/tasks/${t.id}`).expect(204);
  });

  test('members cannot manage projects, budgets or members (403)', async () => {
    await member.as('post', `/api/orgs/${O.org.id}/projects`).send({ name: 'x', budget: '1' }).expect(403);
    await member.as('patch', `/api/orgs/${O.org.id}/projects/${O.project.id}`).send({ budget: '1' }).expect(403);
    await member.as('delete', `/api/orgs/${O.org.id}/projects/${O.project.id}`).expect(403);
    await member.as('post', `/api/orgs/${O.org.id}/members`).send({ email: outsider.email, role: 'member' }).expect(403);
    await member.as('patch', `/api/orgs/${O.org.id}/members/${member.id}`).send({ role: 'admin' }).expect(403);
    await member.as('patch', `/api/orgs/${O.org.id}`).send({ name: 'renamed' }).expect(403);
  });

  test('admin can promote and demote; the last admin cannot be demoted or removed', async () => {
    await admin.as('patch', `/api/orgs/${O.org.id}/members/${admin.id}`).send({ role: 'member' }).expect(409);
    await admin.as('delete', `/api/orgs/${O.org.id}/members/${admin.id}`).expect(409);
    await admin.as('patch', `/api/orgs/${O.org.id}/members/${member.id}`).send({ role: 'admin' }).expect(200);
    // Now there are two admins, so the original admin may step down.
    await admin.as('patch', `/api/orgs/${O.org.id}/members/${admin.id}`).send({ role: 'member' }).expect(200);
    await admin.as('post', `/api/orgs/${O.org.id}/projects`).send({ name: 'x', budget: '1' }).expect(403); // takes effect at once
    await member.as('patch', `/api/orgs/${O.org.id}/members/${admin.id}`).send({ role: 'admin' }).expect(200);
  });

  test('adding unknown or duplicate members fails cleanly', async () => {
    await admin.as('post', `/api/orgs/${O.org.id}/members`).send({ email: 'nobody@test.local', role: 'member' }).expect(404);
    await admin.as('post', `/api/orgs/${O.org.id}/members`).send({ email: member.email, role: 'member' }).expect(409);
    await admin.as('post', `/api/orgs/${O.org.id}/members`).send({ email: outsider.email, role: 'owner' }).expect(400);
  });
});
