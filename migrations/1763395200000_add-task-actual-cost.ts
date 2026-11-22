import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Tasks get an optional ACTUAL cost (what was really paid), next to the estimate.
 * Projects then show budget vs committed (estimates) vs actual, and a status:
 * on track / at risk (committed > budget) / overrun (actual > budget).
 * NULL means "not recorded yet", which is different from 0.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    ALTER TABLE tasks ADD COLUMN actual_cost_santim bigint;
    ALTER TABLE tasks ADD CONSTRAINT tasks_actual_cost_check CHECK (actual_cost_santim >= 0);
  `);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`ALTER TABLE tasks DROP COLUMN actual_cost_santim;`);
};
