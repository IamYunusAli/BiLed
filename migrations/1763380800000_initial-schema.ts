import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * v1 schema: users, organizations (tenants), memberships (user <-> org with a role),
 * projects (ETB budget) and tasks (ETB estimated cost).
 *
 * Tenant isolation at the schema level: tasks carry org_id, and the composite foreign key
 * (project_id, org_id) -> projects(id, org_id) means a task can never point at a project
 * that belongs to a different organization.
 *
 * Money is stored as integer santim (1 ETB = 100 santim) to avoid floating-point rounding.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE TABLE users (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email         text NOT NULL,
      name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
      password_hash text NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

    CREATE TABLE organizations (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE memberships (
      org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       text NOT NULL CHECK (role IN ('admin', 'member')),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (org_id, user_id)
    );
    CREATE INDEX memberships_user_idx ON memberships (user_id);

    CREATE TABLE projects (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
      description   text NOT NULL DEFAULT '',
      budget_santim bigint NOT NULL CHECK (budget_santim >= 0),
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, org_id)
    );
    CREATE INDEX projects_org_idx ON projects (org_id);

    CREATE TABLE tasks (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id                uuid NOT NULL,
      project_id            uuid NOT NULL,
      title                 text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      description           text NOT NULL DEFAULT '',
      status                text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
      estimated_cost_santim bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_santim >= 0),
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (project_id, org_id) REFERENCES projects (id, org_id) ON DELETE CASCADE
    );
    CREATE INDEX tasks_org_project_idx ON tasks (org_id, project_id);

    -- Invite links: an admin creates a single-use link with a role; whoever opens it (signed in
    -- or after registering) joins the org with that role. Only a SHA-256 hash of the token is
    -- stored, so a database leak does not leak usable links.
    CREATE TABLE invites (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      role       text NOT NULL CHECK (role IN ('admin', 'member')),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at    timestamptz,
      used_by    uuid REFERENCES users(id) ON DELETE SET NULL,
      revoked_at timestamptz
    );
    CREATE INDEX invites_org_idx ON invites (org_id);
  `);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    DROP TABLE invites;
    DROP TABLE tasks;
    DROP TABLE projects;
    DROP TABLE memberships;
    DROP TABLE organizations;
    DROP TABLE users;
  `);
};
