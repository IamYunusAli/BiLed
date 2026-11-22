import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Adds a read-only "viewer" role (for clients, funders, auditors) to memberships and invites.
 *
 * Rollback fails closed: viewers are REMOVED rather than turned into members, because
 * upgrading them would silently grant write access. Unused viewer invite links are revoked.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    ALTER TABLE memberships DROP CONSTRAINT memberships_role_check;
    ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('admin', 'member', 'viewer'));
    ALTER TABLE invites DROP CONSTRAINT invites_role_check;
    ALTER TABLE invites ADD CONSTRAINT invites_role_check CHECK (role IN ('admin', 'member', 'viewer'));
  `);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    DELETE FROM memberships WHERE role = 'viewer';
    UPDATE invites SET role = 'member', revoked_at = COALESCE(revoked_at, now()) WHERE role = 'viewer';
    ALTER TABLE memberships DROP CONSTRAINT memberships_role_check;
    ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('admin', 'member'));
    ALTER TABLE invites DROP CONSTRAINT invites_role_check;
    ALTER TABLE invites ADD CONSTRAINT invites_role_check CHECK (role IN ('admin', 'member'));
  `);
};
