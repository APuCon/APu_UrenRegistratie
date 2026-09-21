import * as sql from 'mssql';

/**
 * Eén gedeelde connection pool per function-instance.
 * Verbinding via de app-instelling SQL_CONNECTION_STRING (ADO.NET-formaat, zoals de Azure Portal die toont).
 */
let poolPromise: Promise<sql.ConnectionPool> | undefined;

// Foutcodes die aangeven dat Azure SQL tijdelijk niet beschikbaar is (o.a. serverless database die wakker wordt).
const TRANSIENT_CODES = new Set([
  4060, 10928, 10929, 40197, 40501, 40613, 49918, 49919, 49920, 18456,
]);
const TRANSIENT_TEXT = /(ETIMEOUT|ESOCKET|ECONNRESET|ECONNCLOSED|ELOGIN|Failed to connect|Connection lost|not currently available)/i;

export class TransientDbError extends Error {
  constructor(message: string, public readonly inner?: unknown) {
    super(message);
    this.name = 'TransientDbError';
  }
}

export function isTransient(err: unknown): boolean {
  const e = err as { number?: number; code?: string; message?: string; originalError?: { number?: number } };
  const num = e?.number ?? e?.originalError?.number;
  if (typeof num === 'number' && TRANSIENT_CODES.has(num)) return true;
  return TRANSIENT_TEXT.test(`${e?.code ?? ''} ${e?.message ?? ''}`);
}

function getPool(): Promise<sql.ConnectionPool> {
  if (poolPromise) return poolPromise;
  const cs = process.env.SQL_CONNECTION_STRING;
  if (!cs) throw new Error('App-instelling SQL_CONNECTION_STRING ontbreekt.');
  const pool = new sql.ConnectionPool(cs);
  pool.on('error', () => {
    poolPromise = undefined;
  });
  const connecting = pool.connect().catch((err: unknown) => {
    poolPromise = undefined;
    throw err;
  });
  poolPromise = connecting;
  return connecting;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Maak verbinding; bij tijdelijke fouten (bijv. een serverless database die wakker wordt) een paar keer opnieuw.
 * Alleen de verbindingsfase wordt herhaald, nooit een query - zo wordt een INSERT nooit dubbel uitgevoerd.
 */
async function connected(): Promise<sql.ConnectionPool> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await getPool();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err)) throw err;
      poolPromise = undefined;
      if (attempt < maxAttempts) await sleep(4000 * attempt);
    }
  }
  throw new TransientDbError('De database is tijdelijk niet beschikbaar (mogelijk wordt hij opgestart).', lastErr);
}

export type Params = Record<string, unknown>;
export type QueryFn = <T = Record<string, unknown>>(text: string, params?: Params) => Promise<T[]>;

function bind(request: sql.Request, params: Params) {
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value === undefined ? null : (value as string | number | boolean | null));
  }
}

/** Voer één query uit en geef de rijen terug. */
export const query: QueryFn = async <T>(text: string, params: Params = {}) => {
  const pool = await connected();
  const request = pool.request();
  bind(request, params);
  const result = await request.query(text);
  return (result.recordset ?? []) as T[];
};

/** Voer meerdere queries uit in één transactie; bij een fout wordt alles teruggedraaid. */
export async function transaction<T>(work: (q: QueryFn) => Promise<T>): Promise<T> {
  const pool = await connected();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const q: QueryFn = async <R>(text: string, params: Params = {}) => {
    const request = new sql.Request(tx);
    bind(request, params);
    const result = await request.query(text);
    return (result.recordset ?? []) as R[];
  };
  try {
    const out = await work(q);
    await tx.commit();
    return out;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* rollback kan falen als de verbinding al weg is */
    }
    throw err;
  }
}
