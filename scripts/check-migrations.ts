// CI check for the migrations (runs against the throwaway CI database, never production):
//   1. Roll back to just before the priority migration, create a task that has no priority,
//      migrate up again and assert the backfill made it 'medium' and the constraints hold.
//   2. Roll EVERY migration back to an empty schema, then apply them all again.
// Exits non-zero on any failure, which fails the pipeline before tests or deploy.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';
import { runner } from 'node-pg-migrate';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run destructive migration checks in production');

const dir = path.join(import.meta.dirname, '..', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort();
const priorityIndex = files.findIndex((f) => f.includes('add-task-priority'));
assert.ok(priorityIndex > 0, 'priority migration not found');

const migrate = (direction: 'up' | 'down', count: number) =>
  runner({ databaseUrl, dir, migrationsTable: 'pgmigrations', direction, count, checkOrder: true, log: () => {} });

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
const step = (msg: string): void => console.log(`• ${msg}`);

try {
  await migrate('up', Infinity);
  step(`all ${files.length} migrations applied`);

  // 1. Backfill check
  await migrate('down', files.length - priorityIndex);
  const { rowCount: hasColumn } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'priority'`,
  );
  assert.equal(hasColumn, 0, 'priority column should not exist before the migration');
  step('rolled back to before the priority migration');

  const user = (await client.query(`INSERT INTO users (email, name, password_hash) VALUES ('migration-check@test.local', 'Migration Check', 'x') RETURNING id`)).rows[0].id;
  const org = (await client.query(`INSERT INTO organizations (name, created_by) VALUES ('Migration Check Org', $1) RETURNING id`, [user])).rows[0].id;
  const project = (await client.query(`INSERT INTO projects (org_id, name, budget_santim) VALUES ($1, 'Legacy project', 100000) RETURNING id`, [org])).rows[0].id;
  const task = (await client.query(`INSERT INTO tasks (org_id, project_id, title, estimated_cost_santim) VALUES ($1, $2, 'Legacy task', 5000) RETURNING id`, [org, project])).rows[0].id;
  step('created a pre-existing task without a priority');

  await migrate('up', Infinity);
  const { rows: [row] } = await client.query(`SELECT priority, title, estimated_cost_santim FROM tasks WHERE id = $1`, [task]);
  assert.equal(row.priority, 'medium', 'existing task should be backfilled to medium');
  assert.equal(row.title, 'Legacy task', 'existing data must be unchanged');
  assert.equal(Number(row.estimated_cost_santim), 5000, 'existing data must be unchanged');
  step('backfill: the existing task became medium, its other data unchanged');

  const fresh = (await client.query(`INSERT INTO tasks (org_id, project_id, title) VALUES ($1, $2, 'New task') RETURNING priority`, [org, project])).rows[0];
  assert.equal(fresh.priority, 'medium', 'new tasks default to medium');
  await assert.rejects(client.query(`UPDATE tasks SET priority = 'urgent' WHERE id = $1`, [task]), /tasks_priority_check/);
  await assert.rejects(client.query(`UPDATE tasks SET priority = NULL WHERE id = $1`, [task]), /null value/);
  step('constraints: default medium, NOT NULL, only low/medium/high allowed');

  await client.query(`DELETE FROM organizations WHERE id = $1`, [org]);
  await client.query(`DELETE FROM users WHERE id = $1`, [user]);

  // 2. Full reversibility
  await migrate('down', files.length);
  const { rows: left } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'pgmigrations'`,
  );
  assert.deepEqual(left, [], `tables left after rolling everything back: ${left.map((t) => t.table_name).join(', ')}`);
  step('every migration rolled back to an empty schema');

  await migrate('up', Infinity);
  step('every migration applied again');
  console.log('Migration checks passed.');
} finally {
  await client.end();
}
