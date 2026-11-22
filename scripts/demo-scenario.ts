// Creates realistic demo users and data by USING THE APP like a browser does: it registers through
// the sign-up form, joins organizations through real invite links, and posts the same forms as the
// UI (session cookie + same-origin header), so every rule applies: validation, roles, tenant
// isolation, activity log. It also checks that the rules hold for these users.
//
//   DEMO_BASE_URL=http://localhost:3000 npm run demo
//
// Generated passwords are written to .local/demo-accounts.json (git-ignored), never printed.
// Nothing is deleted. The script refuses to run twice against the same database.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import type { MyOrgRow } from '../src/repositories/organizations.js';
import type { MyTaskGroup, Project, Task } from '../src/services/projects.js';

const BASE = (process.env.DEMO_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const OUT = path.join(import.meta.dirname, '..', '.local', 'demo-accounts.json');
const day = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

type Form = Record<string, string>;

interface Person {
  name: string;
  email: string;
  password: string;
  id: string; // filled in after registration
}

interface DemoTask {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  estimate: string;
  assignee?: PersonKey;
  due?: string;
}

/** One signed-in person in a "browser": keeps the session cookie, posts forms same-origin. */
class Session {
  readonly person: Person;
  cookie = '';

  constructor(person: Person) {
    this.person = person;
  }
  async request(method: string, url: string, form?: Form) {
    const res = await fetch(BASE + url, {
      method,
      redirect: 'manual',
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' } : {}),
        accept: url.startsWith('/api') ? 'application/json' : 'text/html',
      },
      body: form ? new URLSearchParams(form) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie?.startsWith('token=')) this.cookie = setCookie.split(';')[0] ?? '';
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location') ?? '', text };
  }
  async post(url: string, form: Form, expected = 303) {
    const r = await this.request('POST', url, form);
    if (r.status !== expected) {
      const msg = r.text.match(/role="alert"[^>]*>[\s\S]*?<span>([^<]+)/)?.[1] ?? r.text.slice(0, 200);
      throw new Error(`${this.person.name}: POST ${url} → ${r.status} (expected ${expected}): ${msg}`);
    }
    return r;
  }
  async page(url: string) {
    return this.request('GET', url);
  }
  /** GET a JSON API endpoint; the caller states the response shape. */
  async api<T>(url: string): Promise<T> {
    const r = await this.request('GET', url);
    assert.equal(r.status, 200, `${this.person.name}: GET ${url} → ${r.status}`);
    return JSON.parse(r.text) as T;
  }
}

/** A capture group that must be present (the script fails loudly if a page changed shape). */
function mustMatch(text: string, pattern: RegExp, what: string): string {
  const value = text.match(pattern)?.[1];
  if (!value) throw new Error(`could not find ${what}`);
  return value;
}

const idFrom = (location: string, kind: string): string =>
  mustMatch(location, new RegExp(`/${kind}/([0-9a-f-]{36})`), `a ${kind} id in ${location}`);

// ---- People (fictional; example.com addresses never deliver mail) ---------------------------
const person = (name: string, email: string): Person => ({ name, email, password: randomBytes(12).toString('base64url'), id: '' });
const people = {
  mekdes: person('Mekdes Alemu', 'mekdes.alemu@example.com'),
  yonas: person('Yonas Tadesse', 'yonas.tadesse@example.com'),
  liya: person('Liya Girma', 'liya.girma@example.com'),
  dawit: person('Dawit Haile', 'dawit.haile@example.com'),
  ruth: person('Ruth Mengistu', 'ruth.mengistu@example.com'),
  samuel: person('Samuel Bekele', 'samuel.bekele@example.com'),
  kalkidan: person('Kalkidan Assefa', 'kalkidan.assefa@example.com'),
  bereket: person('Bereket Wolde', 'bereket.wolde@example.com'),
  hirut: person('Hirut Desta', 'hirut.desta@example.com'),
};
type PersonKey = keyof typeof people;
const keys = Object.keys(people) as PersonKey[];

if (existsSync(OUT)) {
  console.error(`${OUT} already exists: the demo data has been created before. Not running twice.`);
  process.exit(1);
}
const health = (await fetch(`${BASE}/healthz`).then((r) => r.json()).catch(() => null)) as { ok?: boolean } | null;
if (!health?.ok) throw new Error(`App not reachable at ${BASE}`);

const s = Object.fromEntries(keys.map((k) => [k, new Session(people[k])])) as Record<PersonKey, Session>;
const step = (msg: string): void => console.log(`✓ ${msg}`);

async function register(key: PersonKey, invite?: string) {
  const p = people[key];
  const r = await s[key].post('/register', { name: p.name, email: p.email, password: p.password, ...(invite ? { invite } : {}) });
  p.id = (await s[key].api<{ user: { id: string } }>('/api/me')).user.id;
  return r;
}
async function createOrg(key: PersonKey, name: string): Promise<string> {
  const r = await s[key].post('/orgs', { name });
  return idFrom(r.location, 'orgs');
}
async function invite(key: PersonKey, orgId: string, role: string): Promise<string> {
  const r = await s[key].post(`/orgs/${orgId}/invites`, { role }, 201);
  const url = mustMatch(r.text, /id="inv-url"[^>]*value="([^"]+)"/, 'the invite link');
  return mustMatch(url, /\/join\/(.+)$/, 'the invite token');
}
async function createProject(key: PersonKey, orgId: string, project: Form): Promise<string> {
  const r = await s[key].post(`/orgs/${orgId}/projects`, project);
  return idFrom(r.location, 'projects');
}
async function addTask(key: PersonKey, orgId: string, projectId: string, t: DemoTask): Promise<void> {
  await s[key].post(`/orgs/${orgId}/projects/${projectId}/tasks`, {
    title: t.title, description: t.description ?? '', status: t.status ?? 'todo', priority: t.priority ?? 'medium',
    estimatedCost: t.estimate, assigneeId: t.assignee ? people[t.assignee].id : '', dueDate: t.due ?? '',
  });
}
async function findTask(key: PersonKey, orgId: string, projectId: string, title: string): Promise<Task> {
  const tasks = await s[key].api<Task[]>(`/api/orgs/${orgId}/projects/${projectId}/tasks`);
  const t = tasks.find((x) => x.title === title);
  assert.ok(t, `task ${title} not found`);
  return t;
}
/** Edits a task through the edit form (which always sends every field, like the browser). */
async function editTask(key: PersonKey, orgId: string, projectId: string, title: string, changes: Form): Promise<void> {
  const t = await findTask(key, orgId, projectId, title);
  const form: Form = {
    title: t.title, description: t.description, status: t.status, priority: t.priority,
    estimatedCost: t.estimated_cost_etb, actualCost: t.actual_cost_etb ?? '', assigneeId: t.assignee_id ?? '', dueDate: t.due_date ?? '',
    ...changes,
  };
  await s[key].post(`/orgs/${orgId}/tasks/${t.id}/edit`, form);
}

// ---- 1. Accounts and organizations ------------------------------------------------------------
await register('mekdes');
await register('samuel');
await register('kalkidan');
step('registered three organization founders');

const yeka = await createOrg('mekdes', 'Yeka Community Builders');
const abay = await createOrg('samuel', 'Abay Digital');
const sheger = await createOrg('kalkidan', 'Sheger Water Project');
step('created Yeka Community Builders, Abay Digital, Sheger Water Project');

// New people join by registering through an invite link the admin created.
await register('yonas', await invite('mekdes', yeka, 'member'));
await register('liya', await invite('mekdes', yeka, 'member'));
await register('dawit', await invite('mekdes', yeka, 'viewer'));
await register('ruth', await invite('samuel', abay, 'member'));
await register('bereket', await invite('kalkidan', sheger, 'member'));
await register('hirut', await invite('kalkidan', sheger, 'viewer'));
step('six people registered through invite links (members and viewers)');

// Ruth already has an account: she opens a Yeka invite while signed in and joins a second org.
const ruthToYeka = await invite('mekdes', yeka, 'member');
const joined = await s.ruth.post(`/join/${ruthToYeka}`, {});
assert.equal(joined.location, `/orgs/${yeka}?ok=joined`);
step('Ruth (already registered) joined a second organization with an invite link');

// Admin housekeeping: promote a second admin, rename an org, revoke an unused link, leave one pending.
await s.mekdes.post(`/orgs/${yeka}/members/${people.liya.id}/role`, { role: 'admin' });
await s.samuel.post(`/orgs/${abay}/rename`, { name: 'Abay Digital Studio' });
await invite('mekdes', yeka, 'member');
const [newestYeka] = await s.mekdes.api<Array<{ id: string }>>(`/api/orgs/${yeka}/invites`);
assert.ok(newestYeka, 'Yeka should have a pending invite');
await s.mekdes.post(`/orgs/${yeka}/invites/${newestYeka.id}/revoke`, {});
await invite('kalkidan', sheger, 'viewer'); // left pending on purpose
step('promoted Liya to admin, renamed Abay Digital → Abay Digital Studio, revoked one link, left one pending');

// ---- 2. Projects and tasks --------------------------------------------------------------------
const healthPost = await createProject('mekdes', yeka, {
  name: 'Health Post Construction — Yeka', budget: '1200000',
  description: 'Two-room health post with a waiting area and a solar-powered vaccine fridge.',
});
for (const t of [
  { title: 'Site survey and soil test', priority: 'medium', assignee: 'yonas', due: day(-40), estimate: '45000' },
  { title: 'Foundation and slab', priority: 'high', assignee: 'yonas', due: day(-15), estimate: '260000' },
  { title: 'Walls and roofing', priority: 'high', assignee: 'liya', due: day(12), estimate: '410000' },
  { title: 'Electrical wiring and solar fridge', priority: 'high', assignee: 'ruth', due: day(30), estimate: '165000' },
  { title: 'Furniture and medical equipment', priority: 'medium', due: day(60), estimate: '140000' },
  { title: 'Handover ceremony with the woreda', priority: 'low', assignee: 'liya', due: day(75), estimate: '18000' },
] satisfies DemoTask[]) await addTask('mekdes', yeka, healthPost, t);
// A member (not only admins) can add tasks: Yonas plans the plumbing himself.
await addTask('yonas', yeka, healthPost, { title: 'Plumbing and 5,000 L water tank', priority: 'medium', assignee: 'yonas', due: day(-3), estimate: '95000' });
// Work happens: members record progress and actual costs.
await editTask('yonas', yeka, healthPost, 'Site survey and soil test', { status: 'done', actualCost: '42500' });
await editTask('yonas', yeka, healthPost, 'Foundation and slab', { status: 'done', actualCost: '271300' });
await editTask('liya', yeka, healthPost, 'Walls and roofing', { status: 'in_progress', actualCost: '180000' });

const latrine = await createProject('liya', yeka, {
  name: 'School Latrine Block', budget: '350000',
  description: 'Six-stall latrine block with handwashing stations for Kokeb Primary School.',
});
for (const t of [
  { title: 'Design approval by the woreda', priority: 'medium', assignee: 'liya', due: day(-25), estimate: '12000' },
  { title: 'Excavation and septic pit', priority: 'high', assignee: 'yonas', due: day(5), estimate: '150000' },
  { title: 'Superstructure', priority: 'high', assignee: 'yonas', due: day(20), estimate: '175000' },
  { title: 'Handwashing stations', priority: 'medium', assignee: 'ruth', due: day(28), estimate: '64000' },
] satisfies DemoTask[]) await addTask('liya', yeka, latrine, t);
await editTask('liya', yeka, latrine, 'Design approval by the woreda', { status: 'done', actualCost: '12000' });
await editTask('yonas', yeka, latrine, 'Excavation and septic pit', { status: 'in_progress', actualCost: '98000' });
await s.mekdes.post(`/orgs/${yeka}/projects/${latrine}/edit`, {
  name: 'School Latrine Block', budget: '380000',
  description: 'Six-stall latrine block with handwashing stations for Kokeb Primary School.',
});
step('Yeka: 2 projects, 11 tasks, progress and actual costs recorded by the team, one budget raised');

const bankApp = await createProject('samuel', abay, {
  name: 'Mobile Banking App MVP', budget: '650000', description: 'Android-first app for a microfinance client, with Telebirr top-ups.',
});
for (const t of [
  { title: 'UX research with 20 customers', priority: 'high', assignee: 'ruth', due: day(-30), estimate: '60000' },
  { title: 'UI design system', priority: 'medium', assignee: 'ruth', due: day(-12), estimate: '85000' },
  { title: 'Backend API and Telebirr sandbox', priority: 'high', assignee: 'samuel', due: day(14), estimate: '240000' },
  { title: 'Android app', priority: 'high', assignee: 'ruth', due: day(21), estimate: '180000' },
  { title: 'Security review', priority: 'medium', due: day(35), estimate: '55000' },
] satisfies DemoTask[]) await addTask('samuel', abay, bankApp, t);
await editTask('ruth', abay, bankApp, 'UX research with 20 customers', { status: 'done', actualCost: '58000' });
await editTask('ruth', abay, bankApp, 'UI design system', { status: 'done', actualCost: '85000' });
await editTask('samuel', abay, bankApp, 'Backend API and Telebirr sandbox', { status: 'in_progress', actualCost: '120000' });
await editTask('ruth', abay, bankApp, 'Android app', { status: 'in_progress', actualCost: '40000' });

const coffee = await createProject('samuel', abay, {
  name: 'Coffee Exporter Website', budget: '120000', description: 'Bilingual website and product catalogue for a Sidama coffee exporter.',
});
for (const t of [
  { title: 'Content and photography', priority: 'medium', assignee: 'ruth', due: day(-20), estimate: '30000' },
  { title: 'Website build', priority: 'high', assignee: 'samuel', due: day(-6), estimate: '65000' },
  { title: 'SEO and launch', priority: 'low', assignee: 'ruth', due: day(4), estimate: '15000' },
] satisfies DemoTask[]) await addTask('samuel', abay, coffee, t);
await editTask('ruth', abay, coffee, 'Content and photography', { status: 'done', actualCost: '41000' });
await editTask('samuel', abay, coffee, 'Website build', { status: 'done', actualCost: '88500' });
await editTask('ruth', abay, coffee, 'SEO and launch', { status: 'in_progress' });
step('Abay: 2 projects, 8 tasks; the coffee website has really overspent');

const borehole = await createProject('kalkidan', sheger, {
  name: 'Borehole Drilling — Sululta', budget: '2400000', description: 'A 180 m borehole serving about 3,000 residents, funded by two donors.',
});
for (const t of [
  { title: 'Hydrogeological survey', priority: 'high', assignee: 'bereket', due: day(-50), estimate: '180000' },
  { title: 'Drilling permit', priority: 'high', assignee: 'kalkidan', due: day(-35), estimate: '25000' },
  { title: 'Drilling the 180 m borehole', priority: 'high', assignee: 'bereket', due: day(10), estimate: '1350000' },
  { title: 'Submersible pump and generator', priority: 'high', assignee: 'bereket', due: day(25), estimate: '420000' },
  { title: 'Four distribution points', priority: 'medium', due: day(45), estimate: '260000' },
  { title: 'Water quality testing', priority: 'medium', assignee: 'kalkidan', due: day(-1), estimate: '38000' },
] satisfies DemoTask[]) await addTask('kalkidan', sheger, borehole, t);
await editTask('bereket', sheger, borehole, 'Hydrogeological survey', { status: 'done', actualCost: '176000' });
await editTask('kalkidan', sheger, borehole, 'Drilling permit', { status: 'done', actualCost: '25000' });
await editTask('bereket', sheger, borehole, 'Drilling the 180 m borehole', { status: 'in_progress', actualCost: '900000' });

const training = await createProject('kalkidan', sheger, {
  name: 'Water Committee Training', budget: '85000', description: 'Training the community water committee to run and maintain the scheme.',
});
for (const t of [
  { title: 'Training materials in Amharic and Afaan Oromo', priority: 'medium', assignee: 'kalkidan', due: day(7), estimate: '22000' },
  { title: 'Three-day workshop', priority: 'medium', assignee: 'bereket', due: day(18), estimate: '54000' },
  { title: 'Follow-up visits', priority: 'low', due: day(60), estimate: '12000' },
] satisfies DemoTask[]) await addTask('kalkidan', sheger, training, t);
await editTask('kalkidan', sheger, training, 'Training materials in Amharic and Afaan Oromo', { status: 'in_progress', actualCost: '9000' });
step('Sheger: 2 projects, 9 tasks');

// ---- 3. The rules hold for these real users ---------------------------------------------------
const expectStatus = async (sess: Session, method: string, url: string, form: Form | undefined, status: number, label: string) => {
  const r = await sess.request(method, url, form);
  assert.equal(r.status, status, `${label}: expected ${status}, got ${r.status}`);
};
await expectStatus(s.samuel, 'GET', `/orgs/${yeka}`, undefined, 404, 'Samuel opening Yeka');
await expectStatus(s.samuel, 'GET', `/orgs/${abay}/projects/${healthPost}`, undefined, 404, 'Samuel swapping in a Yeka project id');
await expectStatus(s.hirut, 'GET', `/api/orgs/${abay}/projects`, undefined, 404, 'Hirut reading Abay projects');
await expectStatus(s.bereket, 'POST', `/orgs/${yeka}/projects/${latrine}/tasks`, { title: 'Sneaky', estimatedCost: '1' }, 404, 'Bereket adding a task to Yeka');
await expectStatus(s.dawit, 'POST', `/orgs/${yeka}/projects/${healthPost}/tasks`, { title: 'Viewer task', estimatedCost: '1' }, 403, 'Dawit (viewer) adding a task');
await expectStatus(s.hirut, 'GET', `/orgs/${sheger}/tasks/${(await findTask('kalkidan', sheger, borehole, 'Drilling permit')).id}/edit`, undefined, 403, 'Hirut (viewer) opening a task editor');
await expectStatus(s.yonas, 'POST', `/orgs/${yeka}/projects`, { name: 'Member project', budget: '1' }, 403, 'Yonas (member) creating a project');
step('isolation: outsiders get 404 for other orgs, even with real ids; viewers and members get 403 where they should');

const orgsOf = async (key: PersonKey) => (await s[key].api<MyOrgRow[]>('/api/orgs')).map((o) => `${o.name} (${o.role})`).sort();
assert.deepEqual(await orgsOf('ruth'), ['Abay Digital Studio (member)', 'Yeka Community Builders (member)']);
assert.deepEqual(await orgsOf('hirut'), ['Sheger Water Project (viewer)']);
assert.deepEqual(await orgsOf('liya'), ['Yeka Community Builders (admin)']);
step('each person lists exactly their own organizations (Ruth: two)');

const statusOf = async (key: PersonKey, orgId: string) => Object.fromEntries((await s[key].api<Project[]>(`/api/orgs/${orgId}/projects`)).map((p) => [p.name, p.status]));
assert.deepEqual(await statusOf('mekdes', yeka), { 'Health Post Construction — Yeka': 'on_track', 'School Latrine Block': 'at_risk' });
assert.deepEqual(await statusOf('samuel', abay), { 'Mobile Banking App MVP': 'on_track', 'Coffee Exporter Website': 'overrun' });
assert.deepEqual(await statusOf('hirut', sheger), { 'Borehole Drilling — Sululta': 'on_track', 'Water Committee Training': 'at_risk' });
step('budget status: on track, at risk and overrun all present');

const ruthTasks = await s.ruth.api<MyTaskGroup[]>('/api/me/tasks');
assert.deepEqual(ruthTasks.map((g) => g.orgName).sort(), ['Abay Digital Studio', 'Yeka Community Builders']);
step(`My tasks: Ruth sees ${ruthTasks.reduce((n, g) => n + g.tasks.length, 0)} tasks across her two organizations`);

const activity = await s.dawit.api<unknown[]>(`/api/orgs/${yeka}/activity`);
assert.ok(activity.length >= 20, 'Yeka should have a rich activity log');
step(`activity log: ${activity.length} entries in Yeka, readable by the viewer`);

// ---- 4. Save the accounts (git-ignored) ------------------------------------------------------
mkdirSync(path.dirname(OUT), { recursive: true });
const roles: Record<PersonKey, string> = {
  mekdes: 'Yeka Community Builders: admin', liya: 'Yeka Community Builders: admin (promoted)', yonas: 'Yeka Community Builders: member',
  dawit: 'Yeka Community Builders: viewer', ruth: 'Abay Digital Studio: member; Yeka Community Builders: member',
  samuel: 'Abay Digital Studio: admin', kalkidan: 'Sheger Water Project: admin', bereket: 'Sheger Water Project: member',
  hirut: 'Sheger Water Project: viewer',
};
writeFileSync(OUT, JSON.stringify({
  baseUrl: BASE,
  createdAt: new Date().toISOString(),
  accounts: keys.map((k) => ({ name: people[k].name, email: people[k].email, password: people[k].password, memberships: roles[k] })),
}, null, 2));
console.log(`\nDone. 9 accounts saved to ${path.relative(process.cwd(), OUT)} (git-ignored).`);
