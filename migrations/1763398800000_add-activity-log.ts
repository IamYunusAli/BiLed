import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Per-organization activity log: who changed which budget, task or member, and when.
 *
 * - Scoped by org_id like every other tenant table, and deleted with its organization.
 * - The actor's name is copied at write time, so entries stay readable if the user is deleted.
 * - Append-only: a trigger rejects UPDATE. Rows are only removed by the org-delete cascade.
 * - Entries are written in the same transaction as the change they describe.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE TABLE activity (
      id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
      actor_name  text NOT NULL,
      action      text NOT NULL,
      entity_type text NOT NULL,
      entity_id   uuid,
      summary     text NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX activity_org_created_idx ON activity (org_id, created_at DESC, id DESC);

    CREATE FUNCTION activity_reject_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'activity log is append-only';
    END;
    $$;
    CREATE TRIGGER activity_append_only BEFORE UPDATE ON activity
      FOR EACH ROW EXECUTE FUNCTION activity_reject_update();
  `);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    DROP TABLE activity;
    DROP FUNCTION activity_reject_update();
  `);
};
