import { test, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { SignJWT } from 'jose';
import { app, newUser, pool, PASSWORD } from './helpers.js';
import { setCookies } from './helpers.js';
import type { MyOrgRow } from '../src/repositories/organizations.js';

describe('authentication', () => {
  after(() => pool.end());

  test('API requires a valid token', async () => {
    await request(app).get('/api/orgs').expect(401);
    await request(app).get('/api/orgs').set('Authorization', 'Bearer not-a-jwt').expect(401);
    const forged = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('x')
      .sign(new TextEncoder().encode('some-other-secret-some-other-secret-123'));
    await request(app).get('/api/orgs').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  test('login failures use one generic message', async () => {
    const u = await newUser('auth');
    const wrongPw = await request(app).post('/api/auth/login').send({ email: u.email, password: 'wrong-password' }).expect(401);
    const noUser = await request(app).post('/api/auth/login').send({ email: 'ghost@test.local', password: 'wrong-password' }).expect(401);
    assert.equal(wrongPw.body.error, 'Invalid email or password');
    assert.equal(noUser.body.error, wrongPw.body.error);
  });

  test('emails are unique regardless of case, and login is case-insensitive', async () => {
    const u = await newUser('case');
    await request(app).post('/api/auth/register').send({ name: 'Dup', email: u.email.toUpperCase(), password: PASSWORD }).expect(409);
    await request(app).post('/api/auth/login').send({ email: u.email.toUpperCase(), password: PASSWORD }).expect(200);
  });

  test('registration validates input and never returns the password hash', async () => {
    const bad = await request(app).post('/api/auth/register').send({ name: '', email: 'nope', password: 'short' }).expect(400);
    assert.ok(bad.body.details.email && bad.body.details.password && bad.body.details.name);
    const u = await newUser('nohash');
    const me = await u.as('get', '/api/me').expect(200);
    assert.equal(me.body.user.password_hash, undefined);
  });

  test('web login sets an httpOnly SameSite cookie and redirects', async () => {
    const u = await newUser('web');
    const res = await request(app).post('/login').type('form').send({ email: u.email, password: PASSWORD }).expect(303);
    assert.equal(res.headers.location, '/orgs');
    const cookie = setCookies(res).join(';');
    assert.match(cookie, /token=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
  });

  test('pages redirect to login when logged out', async () => {
    const res = await request(app).get('/orgs').expect(303);
    assert.equal(res.headers.location, '/login');
  });

  test('cross-site form posts are blocked (CSRF guard)', async () => {
    const u = await newUser('csrf');
    await request(app).post('/orgs').set('Cookie', `token=${u.token}`).set('Sec-Fetch-Site', 'cross-site')
      .type('form').send({ name: 'Evil' }).expect(403);
    await request(app).post('/orgs').set('Cookie', `token=${u.token}`).set('Origin', 'https://evil.example')
      .type('form').send({ name: 'Evil' }).expect(403);
    await request(app).post('/orgs').set('Cookie', `token=${u.token}`).set('Sec-Fetch-Site', 'same-origin')
      .type('form').send({ name: 'Legit' }).expect(303);
    const { body } = await u.as('get', '/api/orgs').expect(200);
    assert.deepEqual(body.map((o: MyOrgRow) => o.name), ['Legit']);
  });
});
