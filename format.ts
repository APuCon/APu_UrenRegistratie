const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
const eurRond = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const uren = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const fmtEUR = (n: number | null | undefined) => (n == null ? '' : eur.format(n));
export const fmtEURRond = (n: number) => eurRond.format(n);
export const fmtUren = (n: number | null | undefined) => (n == null ? '' : uren.format(n));
export const fmtPct = (n: number) => `${Math.round(n)}%`;

/** JJJJ-MM-DD -> DD-MM-JJJJ */
export function fmtDatum(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
export function dagNaam(iso: string): string {
  return DAGEN[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
/** JJJJ-MM -> "mrt" (of "mrt ’26" als metJaar) */
export function maandNaam(jjjjmm: string, metJaar = false): string {
  const [y, m] = jjjjmm.split('-');
  const naam = MAANDEN[Number(m) - 1];
  return metJaar ? `${naam} ’${y.slice(2)}` : naam;
}

export function isoLokaal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const vandaag = () => isoLokaal(new Date());

export function beginVanWeek(d = new Date()): string {
  const x = new Date(d);
  const dag = (x.getDay() + 6) % 7; // maandag = 0
  x.setDate(x.getDate() - dag);
  return isoLokaal(x);
}
export function eindVanWeek(d = new Date()): string {
  const x = new Date(`${beginVanWeek(d)}T12:00:00`);
  x.setDate(x.getDate() + 6);
  return isoLokaal(x);
}
export const beginVanMaand = (d = new Date()) => isoLokaal(new Date(d.getFullYear(), d.getMonth(), 1));
export const eindVanMaand = (d = new Date()) => isoLokaal(new Date(d.getFullYear(), d.getMonth() + 1, 0));

export function projectLabel(code: string | null, naam: string): string {
  return code ? `${code} · ${naam}` : naam;
}

const eurCompact = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
export const fmtEURCompact = (n: number) => eurCompact.format(n);
