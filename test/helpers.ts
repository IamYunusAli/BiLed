import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';

export { pool } from '../src/db.js';
export const app = createApp();

export const PASSWORD = 'correct-horse-battery';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  token: string;
  /** A supertest request authenticated as this user with a Bearer token. */
  as(method: Method, url: string): request.Test;
}

/** Ids of the org, project and task created by orgWithProjectAndTask. */
export interface Fixture {
  org: { id: string; name: string };
  project: { id: string; name: string };
  task: { id: string; title: string; priority: string };
}

/**
 * Registers a brand-new user (unique email, so test files never collide) and returns helpers that
 * call the API as that user with a Bearer token.
 */
export async function newUser(name = 'user'): Promise<TestUser> {
  const email = `${name.replace(/[^a-z0-9]+/gi, "-")}-${randomUUID()}@test.local`; // any display name, valid email
  const reg = await request(app).post('/api/auth/register').send({ name, email, password: PASSWORD });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  const token: string = login.body.token;
  const as = (method: Method, url: string) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
  return { id: login.body.user.id, name, email, token, as };
}

/** Creates an org owned by `owner`, with one project (budget ETB 1,000) and one task (ETB 100). */
export async function orgWithProjectAndTask(owner: TestUser, name = 'Org'): Promise<Fixture> {
  const org = (await owner.as('post', '/api/orgs').send({ name }).expect(201)).body;
  const project = (
    await owner.as('post', `/api/orgs/${org.id}/projects`).send({ name: `${name} project`, budget: '1000' }).expect(201)
  ).body;
  const task = (
    await owner
      .as('post', `/api/orgs/${org.id}/projects/${project.id}/tasks`)
      .send({ title: `${name} task`, estimatedCost: '100' })
      .expect(201)
  ).body;
  return { org, project, task };
}

/** The Set-Cookie headers of a response, always as an array. */
export function setCookies(res: request.Response): string[] {
  const header: unknown = res.headers['set-cookie'];
  return Array.isArray(header) ? header.map(String) : typeof header === 'string' ? [header] : [];
}
