import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from './config.js';

// BIGINT (int8, OID 20) is returned as a string by default. Money is stored as integer santim and
// stays far below Number.MAX_SAFE_INTEGER, so parse it to a Number. SUM() results are cast to
// ::bigint in SQL so they also go through this parser.
pg.types.setTypeParser(20, (value: string) => Number(value));
// DATE (OID 1082) would become a JS Date at local midnight and shift across time zones.
// Due dates are calendar days, so keep them as 'YYYY-MM-DD' strings.
pg.types.setTypeParser(1082, (value: string) => value);

/** Anything that can run a query: the pool, or a client inside a transaction. */
export interface Db {
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}

export const pool = new pg.Pool({
  connectionString: config.databaseUrl, // Neon URLs carry ?sslmode=require
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000, // Neon compute may need a few seconds to resume from suspend
});

// Neon suspends idle computes and drops their connections. Without this listener an idle client
// error would be an uncaught exception and crash the process. The pool reconnects on demand.
pool.on('error', (err) => {
  console.error('Postgres pool: idle client error:', err.message);
});

export const query = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>> =>
  pool.query<R>(text, params);

/** Repositories accept an optional `db` (a transaction client); this is the default. */
export const defaultDb: Db = { query };

/** Runs fn(client) inside a transaction; rolls back on any error. */
export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
