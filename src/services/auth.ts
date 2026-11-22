import * as users from '../repositories/users.js';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../auth/password.js';
import { signToken } from '../auth/jwt.js';
import { HttpError } from '../http-error.js';
import type { User } from '../domain.js';
import type { LoginInput, RegisterInput } from '../validation.js';

export interface Session {
  user: User;
  token: string;
}

export async function register({ name, email, password }: RegisterInput): Promise<Session> {
  if (await users.findByEmail(email)) {
    throw new HttpError(409, 'An account with that email already exists', { email: ['Already registered'] });
  }
  const user = await users.create({ email, name, passwordHash: await hashPassword(password) });
  return { user, token: await signToken(user.id) };
}

export async function login({ email, password }: LoginInput): Promise<Session> {
  const user = await users.findByEmailWithHash(email);
  // Always run a bcrypt comparison so timing does not reveal whether the email exists.
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password');
  const { password_hash: _omit, ...publicUser } = user;
  return { user: publicUser, token: await signToken(user.id) };
}
