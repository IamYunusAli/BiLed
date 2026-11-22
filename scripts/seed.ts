// Seeds the demo data. Idempotent: does nothing if the seed admin already exists.
// Passwords come from environment variables so no credentials live in the repository:
//   SEED_ADMIN_PASSWORD=... SEED_MEMBER_PASSWORD=... [SEED_VIEWER_PASSWORD=...] [SEED_OTHER_PASSWORD=...] npm run seed
import { pool, withTx } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { etbToSantim, formatEtb } from '../src/money.js';
import type { Priority, Status } from '../src/domain.js';

// Trimmed: a stray space or newline pasted into a secret must not become part of the password.
const env = (name: string): string | undefined => process.env[name]?.trim() || undefined;
const adminPassword = env('SEED_ADMIN_PASSWORD');
const memberPassword = env('SEED_MEMBER_PASSWORD');
const viewerPassword = env('SEED_VIEWER_PASSWORD'); // optional: a read-only funder
const otherPassword = env('SEED_OTHER_PASSWORD'); // optional: second org for the isolation demo

if (!adminPassword || !memberPassword) {
  console.error('Set SEED_ADMIN_PASSWORD and SEED_MEMBER_PASSWORD (min 8 characters).');
  process.exit(1);
}

const existing = await pool.query(`SELECT 1 FROM users WHERE lower(email) = 'abebe@example.com'`);
if ((existing.rowCount ?? 0) > 0) {
  console.log('Seed already applied; nothing to do.');
  await pool.end();
  process.exit(0);
}

interface SeedTask {
  title: string;
  description?: string;
  status: Status;
  priority: Priority;
  estimate: string;
  actual?: string;
  assignee?: string;
  due?: string;
}

/** A date N days from today, as YYYY-MM-DD, so the demo always has upcoming and overdue tasks. */
const inDays = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

await withTx(async (c) => {
  const createUser = async (email: string, name: string, password: string): Promise<string> =>
    (await c.query(`INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`, [
      email,
      name,
      await hashPassword(password),
    ])).rows[0]!.id;

  const createOrg = async (name: string, createdBy: string): Promise<string> =>
    (await c.query(`INSERT INTO organizations (name, created_by) VALUES ($1, $2) RETURNING id`, [name, createdBy])).rows[0]!.id;

  const createProject = async (orgId: string, name: string, description: string, budgetEtb: string): Promise<string> =>
    (await c.query(
      `INSERT INTO projects (org_id, name, description, budget_santim) VALUES ($1, $2, $3, $4) RETURNING id`,
      [orgId, name, description, etbToSantim(budgetEtb)],
    )).rows[0]!.id;

  const createTask = (orgId: string, projectId: string, t: SeedTask) =>
    c.query(
      `INSERT INTO tasks (org_id, project_id, title, description, status, priority,
                          estimated_cost_santim, actual_cost_santim, assignee_id, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [orgId, projectId, t.title, t.description ?? '', t.status, t.priority, etbToSantim(t.estimate),
        t.actual ? etbToSantim(t.actual) : null, t.assignee ?? null, t.due ?? null],
    );

  const log = (orgId: string, actorId: string, actorName: string, action: string, entityType: string, summary: string) =>
    c.query(
      `INSERT INTO activity (org_id, actor_id, actor_name, action, entity_type, summary) VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, actorId, actorName, action, entityType, summary],
    );

  // Organization 1: Addis Build Collective. Abebe is admin, Hana is member.
  const abebe = await createUser('abebe@example.com', 'Abebe Kebede', adminPassword);
  const hana = await createUser('hana@example.com', 'Hana Tesfaye', memberPassword);
  const org = await createOrg('Addis Build Collective', abebe);
  await c.query(`INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'admin'), ($1, $3, 'member')`, [org, abebe, hana]);

  const library = await createProject(org, 'Community Library Renovation',
    'Renovate the neighbourhood library in Bole sub-city: roof, wiring, shelving and a reopening event.', '450000');
  const tasks: SeedTask[] = [
    { title: 'Structural assessment', status: 'done', priority: 'medium', estimate: '35000', actual: '33500', assignee: abebe, due: inDays(-20), description: 'Engineer site visit and written report.' },
    { title: 'Roof repair', status: 'in_progress', priority: 'high', estimate: '180000', actual: '92000', assignee: hana, due: inDays(10), description: 'Replace corrugated sheets and gutters.' },
    { title: 'Electrical rewiring', status: 'todo', priority: 'high', estimate: '95000', assignee: hana, due: inDays(-2) },
    { title: 'Shelving & furniture', status: 'todo', priority: 'medium', estimate: '70000', due: inDays(30) },
    { title: 'Reopening event', status: 'todo', priority: 'low', estimate: '15000', due: inDays(45) },
  ];
  for (const t of tasks) await createTask(org, library, t);

  await log(org, abebe, 'Abebe Kebede', 'org.created', 'organization', 'created the organization “Addis Build Collective”');
  await log(org, hana, 'Hana Tesfaye', 'member.joined', 'member', 'joined as Member via an invite link from Abebe Kebede');
  await log(org, abebe, 'Abebe Kebede', 'project.created', 'project', `created project “Community Library Renovation” with a budget of ${formatEtb(etbToSantim('450000'))}`);

  if (viewerPassword) {
    const tigist = await createUser('tigist@example.com', 'Tigist Alemayehu', viewerPassword);
    await c.query(`INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'viewer')`, [org, tigist]);
    await log(org, tigist, 'Tigist Alemayehu', 'member.joined', 'member', 'joined as Viewer via an invite link from Abebe Kebede');
  }

  // Optional organization 2, used to demonstrate isolation live.
  if (otherPassword) {
    const selam = await createUser('selam@example.com', 'Selam Haile', otherPassword);
    const studio = await createOrg('Bole Design Studio', selam);
    await c.query(`INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'admin')`, [studio, selam]);
    const rebrand = await createProject(studio, 'Café Rebrand', 'Logo, menu and signage for a client café.', '120000');
    await createTask(studio, rebrand, { title: 'Logo concepts', status: 'done', priority: 'high', estimate: '30000', actual: '30000', assignee: selam });
    await createTask(studio, rebrand, { title: 'Menu design', status: 'todo', priority: 'medium', estimate: '25000', due: inDays(14) });
    await log(studio, selam, 'Selam Haile', 'org.created', 'organization', 'created the organization “Bole Design Studio”');
  }
});

console.log('Seeded: Addis Build Collective — Abebe (admin), Hana (member), 1 project, 5 tasks (ETB 395,000 committed of 450,000).');
if (viewerPassword) console.log('Seeded: Tigist (viewer) in Addis Build Collective.');
if (otherPassword) console.log('Seeded: Bole Design Studio — Selam (admin), 1 project, 2 tasks.');
await pool.end();
