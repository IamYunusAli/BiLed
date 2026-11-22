import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';

/** Slows down password guessing on login/register. In-memory store: fine for a single instance. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ipv6Subnet: 56,
  skip: () => config.isTest,
  message: { error: 'Too many attempts, try again in a few minutes' },
});
