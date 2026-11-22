import type { NextFunction, Request, Response } from 'express';
import { HttpError, type FieldErrors } from '../http-error.js';
import { render, type PageContext } from '../views/context.js';
import { ErrorPage } from '../views/pages/misc.js';

/** The fields we inspect on errors thrown by pg, body-parser or our own code. */
interface ErrorLike {
  code?: string;
  type?: string;
  status?: number;
  message?: string;
  details?: FieldErrors;
  errors?: Array<{ code?: string }>;
}

const isApi = (req: Request): boolean => req.originalUrl.startsWith('/api');

const DB_DOWN_CODES = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '57P01', '57P03', '08006', '08001'];

/** Connection-level failures (database stopped, unreachable, restarting, or a Neon cold-start timeout). */
function isDatabaseDown(err: ErrorLike): boolean {
  if (err.code && DB_DOWN_CODES.includes(err.code)) return true;
  // AggregateError (IPv4 + IPv6 attempts)
  if (Array.isArray(err.errors) && err.errors.some((e) => e.code !== undefined && DB_DOWN_CODES.includes(e.code))) return true;
  return /Connection terminated|timeout exceeded when trying to connect/i.test(err.message ?? '');
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404));
}

/** Maps any error onto a status code and a safe message. */
function normalize(thrown: unknown): ErrorLike {
  const err: ErrorLike = typeof thrown === 'object' && thrown !== null ? (thrown as ErrorLike) : { message: String(thrown) };
  // Postgres errors that user input can trigger. Everything else is a 500.
  if (err.code === '23505') return new HttpError(409, 'That already exists');
  if (err.code === '22P02') return new HttpError(404); // malformed uuid etc.
  if (err.code === '23503' || err.code === '23514') return new HttpError(400, 'Invalid data');
  if (isDatabaseDown(err)) return new HttpError(503, 'The database is unavailable right now. Please try again in a moment.');
  if (err.type === 'entity.parse.failed') return new HttpError(400, 'Malformed JSON');
  if (err.type === 'entity.too.large') return new HttpError(413, 'Request too large');
  return err;
}

// Express recognises error middleware by its four parameters.
export function errorHandler(thrown: unknown, req: Request, res: Response, _next: NextFunction): void {
  const err = normalize(thrown);
  const status = Number.isInteger(err.status) && err.status! >= 400 && err.status! < 600 ? err.status! : 500;
  if (status >= 500 && status !== 503) console.error(thrown); // server errors only; never log request bodies
  if (status === 503) console.error(`Database unavailable: ${req.method} ${req.originalUrl}`);
  const message = status >= 500 && status !== 503 ? 'Something went wrong' : (err.message ?? 'Error'); // never leak internals

  if (isApi(req)) {
    res.status(status).json({ error: message, ...(err.details ? { details: err.details } : {}) });
    return;
  }
  if (status === 401) return res.redirect(303, '/login');
  // Errors can be raised before the web router set its locals (e.g. by the CSRF guard), so build
  // the whole page context explicitly.
  const ctx: PageContext = {
    user: req.user,
    tenant: undefined,
    myOrgs: [],
    currentPath: req.path,
    notice: null,
    formError: null,
    errors: {},
    values: {},
  };
  render(res.status(status), ErrorPage({ ctx, status, message }));
}
