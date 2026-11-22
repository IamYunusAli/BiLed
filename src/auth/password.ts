import bcrypt from 'bcryptjs';
import { config } from '../config.js';

// OWASP: bcrypt work factor >= 10. 12 in production; 4 in tests so the suite stays fast.
const COST = config.isTest ? 4 : 12;

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, COST);
export const verifyPassword = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

// Compared against when the email does not exist, so a login attempt takes the same time
// whether or not the account exists (no user enumeration by timing).
export const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', COST);
