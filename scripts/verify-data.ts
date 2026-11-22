// Prints row counts and content checksums. Run it right before and right after a migration:
// identical output proves existing data survived. Checksums deliberately exclude columns that a
// migration may add (e.g. priority), so they compare the data that existed before.
import { pool } from '../src/db.js';

const { rows: [summary] } = await pool.query(`
  SELECT (SELECT count(*) FROM users)::int         AS users,
         (SELECT count(*) FROM organizations)::int AS organizations,
         (SELECT count(*) FROM memberships)::int   AS memberships,
         (SELECT count(*) FROM projects)::int      AS projects,
         (SELECT count(*) FROM tasks)::int         AS tasks,
         (SELECT md5(coalesce(string_agg(org_id::text || '|' || user_id::text || '|' || role, ',' ORDER BY org_id, user_id), ''))
            FROM memberships) AS memberships_md5,
         (SELECT md5(coalesce(string_agg(id::text || '|' || name || '|' || budget_santim, ',' ORDER BY id), ''))
            FROM projects) AS projects_md5,
         (SELECT md5(coalesce(string_agg(id::text || '|' || project_id::text || '|' || title || '|' || status || '|' || estimated_cost_santim, ',' ORDER BY id), ''))
            FROM tasks) AS tasks_md5`);
console.table(summary);

const { rowCount: hasPriority } = await pool.query(
  `SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'priority'`,
);
if (hasPriority) {
  const { rows } = await pool.query(`SELECT priority, count(*)::int AS tasks FROM tasks GROUP BY 1 ORDER BY 1`);
  console.log('Tasks by priority:');
  console.table(rows);
}

const { rows: migrations } = await pool.query(`SELECT name, run_on FROM pgmigrations ORDER BY id`);
console.log('Applied migrations:');
console.table(migrations);
await pool.end();
