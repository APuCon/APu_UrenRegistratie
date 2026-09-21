import { HttpError } from './errors';

type Body = Record<string, unknown>;

const fail = (msg: string): never => {
  throw new HttpError(400, msg);
};

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export function reqString(body: Body, key: string, label: string, max: number): string {
  const v = body[key];
  if (isBlank(v)) fail(`${label} is verplicht.`);
  if (typeof v !== 'string') fail(`${label} is ongeldig.`);
  const s = (v as string).trim();
  if (s.length > max) fail(`${label} mag maximaal ${max} tekens bevatten.`);
  return s;
}

export function optString(body: Body, key: string, label: string, max: number): string | null {
  const v = body[key];
  if (isBlank(v)) return null;
  if (typeof v !== 'string') fail(`${label} is ongeldig.`);
  const s = (v as string).trim();
  if (s.length > max) fail(`${label} mag maximaal ${max} tekens bevatten.`);
  return s;
}

export function reqInt(body: Body, key: string, label: string): number {
  const v = body[key];
  if (isBlank(v)) fail(`${label} is verplicht.`);
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) fail(`${label} is ongeldig.`);
  return n;
}

export function optInt(body: Body, key: string, label: string): number | null {
  if (isBlank(body[key])) return null;
  return reqInt(body, key, label);
}

/** Bedrag/uren met maximaal 2 decimalen. */
export function reqDecimal(body: Body, key: string, label: string, min: number, max: number): number {
  const v = body[key];
  if (isBlank(v)) fail(`${label} is verplicht.`);
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) fail(`${label} is ongeldig.`);
  if (n < min || n > max) fail(`${label} moet tussen ${min} en ${max} liggen.`);
  return Math.round(n * 100) / 100;
}

export function reqDate(body: Body, key: string, label: string): string {
  const v = body[key];
  if (isBlank(v)) fail(`${label} is verplicht.`);
  return parseDate(v, label);
}

export function optDate(body: Body, key: string, label: string): string | null {
  if (isBlank(body[key])) return null;
  return parseDate(body[key], label);
}

export function parseDate(v: unknown, label: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(`${label} moet het formaat JJJJ-MM-DD hebben.`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) fail(`${label} is geen geldige datum.`);
  const year = d.getUTCFullYear();
  if (year < 2000 || year > 2100) fail(`${label} ligt buiten het toegestane bereik.`);
  return v as string;
}

export function optBool(body: Body, key: string, fallback: boolean): boolean {
  const v = body[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'boolean') fail(`${key} moet waar of onwaar zijn.`);
  return v as boolean;
}

export function oneOf<T extends string>(body: Body, key: string, label: string, allowed: readonly T[], fallback?: T): T {
  const v = body[key];
  if (isBlank(v)) {
    if (fallback !== undefined) return fallback;
    fail(`${label} is verplicht.`);
  }
  if (!allowed.includes(v as T)) fail(`${label} moet een van deze waarden zijn: ${allowed.join(', ')}.`);
  return v as T;
}

export function idParam(params: Record<string, string>, key = 'id'): number {
  const n = Number(params[key]);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Ongeldig id.');
  return n;
}

/** Query-parameter als optioneel geheel getal. */
export function qInt(q: URLSearchParams, key: string): number | null {
  const v = q.get(key);
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Parameter ${key} is ongeldig.`);
  return n;
}

export function qDate(q: URLSearchParams, key: string): string | null {
  const v = q.get(key);
  if (v === null || v === '') return null;
  return parseDate(v, `Parameter ${key}`);
}

export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
