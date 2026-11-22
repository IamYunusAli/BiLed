import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Tasks get an optional assignee and due date.
 *
 * Tenant isolation at the schema level: the composite foreign key
 * (org_id, assignee_id) -> memberships(org_id, user_id) means a task can only ever be assigned
 * to a MEMBER OF THE SAME ORGANIZATION. When that membership is removed, Postgres clears just the
 * assignee column (ON DELETE SET NULL (assignee_id), PostgreSQL 15+), keeping org_id intact.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    ALTER TABLE tasks ADD COLUMN assignee_id uuid;
    ALTER TABLE tasks ADD COLUMN due_date date;
    ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_membership_fk
      FOREIGN KEY (org_id, assignee_id) REFERENCES memberships (org_id, user_id)
      ON DELETE SET NULL (assignee_id);
    CREATE INDEX tasks_assignee_idx ON tasks (assignee_id) WHERE assignee_id IS NOT NULL;
  `);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    DROP INDEX tasks_assignee_idx;
    ALTER TABLE tasks DROP CONSTRAINT tasks_assignee_membership_fk;
    ALTER TABLE tasks DROP COLUMN due_date;
    ALTER TABLE tasks DROP COLUMN assignee_id;
  `);
};
