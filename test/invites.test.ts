import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, newUser, pool, PASSWORD } from './helpers.js';
import { setCookies, type TestUser } from './helpers.js';

const tokenOf = (url: string): string | undefined => url.split('/join/')[1];

describe('invite links', () => {
  let admin: TestUser, orgId: string, other: TestUser, otherOrgId: string;

  before(async () => {
    admin = await newUser('inv-admin');
    orgId = (await admin.as('post', '/api/orgs').send({ name: 'Invite Org' }).expect(201)).body.id;
    other = await newUser('inv-other');
    otherOrgId = (await other.as('post', '/api/orgs').send({ name: 'Other Org' }).expect(201)).body.id;
  });
  after(() => pool.end());

  test('an admin creates a link; only a hash of the token is stored', async () => {
    const { body } = await admin.as('post', `/api/orgs/${orgId}/invites`).send({ role: 'member' }).expect(201);
    assert.match(body.url, /\/join\/[A-Za-z0-9_-]{43}$/);
    const { rows } = await pool.query('SELECT token_hash FROM invites WHERE id = $1', [body.id]);
    assert.notEqual(rows[0].token_hash, body.token);
    assert.equal(rows[0].token_hash.length, 64); // sha256 hex
  });

  test('accepting joins the org with the chosen role, exactly once', async () => {
    const { body: inv } = await admin.as('post', `/api/orgs/${orgId}/invites`).send({ role: 'admin' }).expect(201);
    const joiner = await newUser('joiner');
    await joiner.as('get', `/api/orgs/${orgId}`).expect(404);
    const preview = await request(app).get(`/api/invites/${inv.token}`).expect(200);
    assert.equal(preview.body.org_name, 'Invite Org');
    await joiner.as('post', `/api/invites/${inv.token}/accept`).expect(201);
    const { body: org } = await joiner.as('get', `/api/orgs/${orgId}`).expect(200);
    assert.equal(org.role, 'admin');
    // single use
    const third = await newUser('late');
    await third.as('post', `/api/invites/${inv.token}/accept`).expect(404);
    await request(app).get(`/api/invites/${inv.token}`).expect(404);
  });

  test('an existing member opening a link does not use it up', async () => {
    const { body: inv } = await admin.as('post', `/api/orgs/${orgId}/invites`).send({ role: 'member' }).expect(201);
    const res = await admin.as('post', `/api/invites/${inv.token}/accept`).expect(200);
    assert.equal(res.body.alreadyMember, true);
    await request(app).get(`/api/invites/${inv.token}`).expect(200);
  });

  test('revoked and expired links stop working', async () => {
    const { body: inv } = await admin.as('post', `/api/orgs/${orgId}/invites`).send({ role: 'member' }).expect(201);
    await admin.as('delete', `/api/orgs/${orgId}/invites/${inv.id}`).expect(204);
    const u = await newUser('revoked');
    await u.as('post', `/api/invites/${inv.token}/accept`).expect(404);

    const { body: inv2 } = await admin.as('post', `/api/orgs/${orgId}/invites`).send({ role: 'member' }).expect(201);
    await pool.query(`UPDATE invites SET expires_at = now() - interval '1 minute' WHERE id = $1`, [inv2.id]);
    await u.as('post', `/api/invites/${inv2.token}/accept`).expect(404);
  });

  test("invites are tenant-scoped: members can't create them, outsiders can't list or revoke them", async () => {
    const { body: inv } = await admin.as('post', `/api/orgs/${orgId}/invites`).send({ role: 'member' }).expect(201);
    const member = await newUser('inv-member');
    await member.as('post', `/api/invites/${inv.token}/accept`).expect(201);
    await member.as('post', `/api/orgs/${orgId}/invites`).send({ role: 'admin' }).expect(403);
    await other.as('get', `/api/orgs/${orgId}/invites`).expect(404);
    const { body: mine } = await admin.as('post', `/api/orgs/${orgId}/invites`).send({ role: 'member' }).expect(201);
    // other org's admin tries to revoke it through their own org URL
    await other.as('delete', `/api/orgs/${otherOrgId}/invites/${mine.id}`).expect(404);
    await request(app).get(`/api/invites/${mine.token}`).expect(200);
  });

  test('garbage tokens are simply not found', async () => {
    await request(app).get('/api/invites/not-a-token').expect(404);
    await request(app).get('/join/not-a-token').expect(404);
  });

  test('web flow: register through a link and land in the org', async () => {
    const { body: inv } = await admin.as('post', `/api/orgs/${orgId}/invites`).send({ role: 'member' }).expect(201);
    const joinPage = await request(app).get(`/join/${inv.token}`).expect(200);
    assert.ok(joinPage.text.includes('Invite Org'));
    const email = `web-joiner-${Date.now()}@test.local`;
    const res = await request(app).post('/register').type('form')
      .send({ name: 'Web Joiner', email, password: PASSWORD, invite: inv.token }).expect(303);
    assert.equal(res.headers.location, `/orgs/${orgId}?ok=joined`);
    const cookie = setCookies(res).find((c) => c.startsWith('token=')) ?? '';
    const page = await request(app).get(`/orgs/${orgId}?ok=joined`).set('Cookie', cookie.split(';')[0] ?? '').expect(200);
    assert.ok(page.text.includes('You joined Invite Org as Member'));
  });
});
