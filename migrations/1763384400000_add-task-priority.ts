import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Part 3: task priorities (low / medium / high).
 *
 * Written the way it would have to run against a live table:
 *   1. expand   add the column as NULLable (metadata-only, no table rewrite, no long lock)
 *   2. backfill existing tasks become 'medium'
 *   3. tighten  default for new rows, NOT NULL, allowed values
 *   4. index    for the priority filter, scoped by org and project
 * node-pg-migrate runs the whole file in ONE transaction: if any step fails, nothing changes.
 *
 * Rollback: `npm run migrate:down` removes the index, constraint and column. Priorities set by
 * users since the migration are lost (see README for the export-first rollback plan).
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn('tasks', { priority: { type: 'text' } });
  pgm.sql(`UPDATE tasks SET priority = 'medium' WHERE priority IS NULL`);
  pgm.alterColumn('tasks', 'priority', { default: 'medium', notNull: true });
  pgm.addConstraint('tasks', 'tasks_priority_check', `CHECK (priority IN ('low', 'medium', 'high'))`);
  pgm.createIndex('tasks', ['org_id', 'project_id', 'priority'], { name: 'tasks_org_project_priority_idx' });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropIndex('tasks', ['org_id', 'project_id', 'priority'], { name: 'tasks_org_project_priority_idx' });
  pgm.dropConstraint('tasks', 'tasks_priority_check');
  pgm.dropColumn('tasks', 'priority');
};
