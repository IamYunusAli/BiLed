import { query } from '../db.js';
import type { User } from '../domain.js';

const PUBLIC_COLUMNS = 'id, email, name, created_at';

interface UserWithHash extends User {
  password_hash: string;
}

export async function create({ email, name, passwordHash }: { email: string; name: string; passwordHash: string }): Promise<User> {
  const { rows } = await query<User>(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING ${PUBLIC_COLUMNS}`,
    [email, name, passwordHash],
  );
  return rows[0]!;
}

export async function findById(id: string): Promise<User | null> {
  const { rows } = await query<User>(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Includes password_hash: only for the login check. */
export async function findByEmailWithHash(email: string): Promise<UserWithHash | null> {
  const { rows } = await query<UserWithHash>(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findByEmail(email: string): Promise<User | null> {
  const { rows } = await query<User>(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE lower(email) = lower($1)`, [email]);
  return rows[0] ?? null;
}
