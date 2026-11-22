// Re-applies the demo-login passwords from environment variables to the EXISTING seeded demo
// users (the seed itself never changes an existing user). Use it when a seed secret was entered
// wrongly: fix the secret, then run "Ops (manual) -> reset-demo-passwords".
// Values are trimmed, so a stray space or newline pasted into a secret can't lock anyone out.
// Prints only which accounts were updated, never a password.
import { pool } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

const DEMO_USERS: Array<[email: string, variable: string]> = [
  ['abebe@example.com', 'SEED_ADMIN_PASSWORD'],
  ['hana@example.com', 'SEED_MEMBER_PASSWORD'],
  ['tigist@example.com', 'SEED_VIEWER_PASSWORD'],
  ['selam@example.com', 'SEED_OTHER_PASSWORD'],
];

let updated = 0;
for (const [email, variable] of DEMO_USERS) {
  const value = (process.env[variable] ?? '').trim();
  if (!value) {
    console.log(`- ${email}: ${variable} not set, skipped`);
    continue;
  }
  if (value.length < 8) {
    console.error(`- ${email}: ${variable} is shorter than 8 characters, skipped`);
    continue;
  }
  if (/^SEED_[A-Z_]+=/.test(value)) {
    console.error(`- ${email}: ${variable} looks like "NAME=value"; put only the value in the secret. Skipped.`);
    continue;
  }
  const { rowCount } = await pool.query(`UPDATE users SET password_hash = $2 WHERE lower(email) = $1`, [
    email,
    await hashPassword(value),
  ]);
  console.log(`- ${email}: ${rowCount ? 'password updated' : 'no such user (not seeded), skipped'}`);
  updated += rowCount ?? 0;
}
console.log(`Done: ${updated} demo account(s) updated.`);
await pool.end();
