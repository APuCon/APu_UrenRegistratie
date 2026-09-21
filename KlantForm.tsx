import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { Klant } from '../lib/types';
import { Field, useToast } from './ui';

type Velden = Omit<Klant, 'klantId' | 'actieveProjecten'>;
const LEEG: Velden = {
  naam: '', contactpersoon: '', email: '', telefoon: '', adres: '', postcode: '', plaats: '',
  kvkNummer: '', btwNummer: '', notities: '', actief: true,
};

export default function KlantForm({
  initial, onSaved, onCancel,
}: { initial?: Klant; onSaved: (k: Klant) => void; onCancel?: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Velden>(() => (initial ? { ...LEEG, ...Object.fromEntries(Object.entries(initial).map(([k, x]) => [k, x ?? ''])) } as Velden : LEEG));
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const set = <K extends keyof Velden>(k: K, x: Velden[K]) => setV((p) => ({ ...p, [k]: x }));
  const tekst = (k: keyof Velden) => (v[k] as string | null) ?? '';

  async function opslaan(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFout(null);
    try {
      const k = initial ? await api.put<Klant>(`/klanten/${initial.klantId}`, v) : await api.post<Klant>('/klanten', v);
      toast(initial ? 'Klant opgeslagen.' : 'Klant aangemaakt.');
      onSaved(k);
    } catch (err) {
      setFout(err instanceof ApiError ? err.message : 'Opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={opslaan}>
      <div className="form-grid">
        <Field label="Naam klant *" span={2}><input value={tekst('naam')} onChange={(e) => set('naam', e.target.value)} required maxLength={200} /></Field>
        <Field label="Contactpersoon"><input value={tekst('contactpersoon')} onChange={(e) => set('contactpersoon', e.target.value)} maxLength={200} /></Field>
        <Field label="E-mail"><input type="email" value={tekst('email')} onChange={(e) => set('email', e.target.value)} maxLength={320} /></Field>
        <Field label="Telefoon"><input value={tekst('telefoon')} onChange={(e) => set('telefoon', e.target.value)} maxLength={50} /></Field>
        <Field label="Adres"><input value={tekst('adres')} onChange={(e) => set('adres', e.target.value)} maxLength={200} /></Field>
        <Field label="Postcode"><input value={tekst('postcode')} onChange={(e) => set('postcode', e.target.value)} maxLength={20} /></Field>
        <Field label="Plaats"><input value={tekst('plaats')} onChange={(e) => set('plaats', e.target.value)} maxLength={100} /></Field>
        <Field label="KvK-nummer"><input value={tekst('kvkNummer')} onChange={(e) => set('kvkNummer', e.target.value)} maxLength={20} /></Field>
        <Field label="BTW-nummer"><input value={tekst('btwNummer')} onChange={(e) => set('btwNummer', e.target.value)} maxLength={30} /></Field>
        <Field label="Notities" span={2}><textarea rows={3} value={tekst('notities')} onChange={(e) => set('notities', e.target.value)} maxLength={4000} /></Field>
        <label className="check-field span2">
          <input type="checkbox" checked={v.actief} onChange={(e) => set('actief', e.target.checked)} />
          <span>Actief (niet-actieve klanten verdwijnen uit de keuzelijsten voor uren)</span>
        </label>
      </div>
      {fout && <div className="alert error" role="alert">{fout}</div>}
      <div className="form-actions">
        {onCancel && <button type="button" className="btn" onClick={onCancel} disabled={busy}>Annuleren</button>}
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
      </div>
    </form>
  );
}
