import { useState, type FormEvent } from 'react';
import KlantForm from '../components/KlantForm';
import { api, ApiError } from '../lib/api';
import { fmtDatum, fmtEUR, vandaag } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { Link } from '../lib/router';
import type { Functie, Klant, Tarief } from '../lib/types';
import { ConfirmModal, Content, Empty, ErrorBox, Field, Modal, PageHead, Pill, Spinner, useToast } from '../components/ui';

/** Het tarief dat vandaag geldt: per functie de rij met de hoogste ingangsdatum <= vandaag. */
function huidigeTariefIds(tarieven: Tarief[]): Set<number> {
  const nu = vandaag();
  const best = new Map<number, Tarief>();
  for (const t of tarieven) {
    if (t.geldigVanaf > nu) continue;
    const b = best.get(t.functieId);
    if (!b || t.geldigVanaf > b.geldigVanaf) best.set(t.functieId, t);
  }
  return new Set([...best.values()].map((t) => t.tariefId));
}

function parseBedrag(s: string): number {
  return Number(s.replace(/[€\s]/g, '').replace(',', '.'));
}

function TariefEditor({ tarief, onClose, onSaved }: { tarief: Tarief; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [bedrag, setBedrag] = useState(String(tarief.uurTarief).replace('.', ','));
  const [vanaf, setVanaf] = useState(tarief.geldigVanaf);
  const [herbereken, setHerbereken] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function opslaan(e: FormEvent) {
    e.preventDefault();
    const n = parseBedrag(bedrag);
    if (!Number.isFinite(n) || n < 0) return setFout('Vul een geldig uurtarief in.');
    setBusy(true);
    setFout(null);
    try {
      const r = await api.put<Tarief & { herberekend: number }>(`/tarieven/${tarief.tariefId}`, {
        uurTarief: n, geldigVanaf: vanaf, herberekenOpenUren: herbereken,
      });
      toast(r.herberekend > 0 ? `Tarief opgeslagen; ${r.herberekend} niet-gefactureerde uurregels herberekend.` : 'Tarief opgeslagen.');
      onSaved();
    } catch (err) {
      setFout(err instanceof ApiError ? err.message : 'Opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Tarief wijzigen — ${tarief.functieNaam}`} onClose={onClose}>
      <form onSubmit={opslaan}>
        <div className="form-grid">
          <Field label="Uurtarief (€)"><input inputMode="decimal" value={bedrag} onChange={(e) => setBedrag(e.target.value)} required /></Field>
          <Field label="Geldig vanaf" hint={tarief.aantalUren > 0 ? 'Vast: er zijn uren op dit tarief geregistreerd.' : undefined}>
            <input type="date" value={vanaf} onChange={(e) => setVanaf(e.target.value)} disabled={tarief.aantalUren > 0} required />
          </Field>
          <label className="check-field span2">
            <input type="checkbox" checked={herbereken} onChange={(e) => setHerbereken(e.target.checked)} />
            <span>
              Pas dit tarief ook toe op reeds geregistreerde <strong>niet-gefactureerde</strong> uren ({tarief.aantalUren} uurregels
              gebruiken dit tarief). Gefactureerde uren blijven ongewijzigd.
            </span>
          </label>
        </div>
        {fout && <div className="alert error" role="alert">{fout}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Annuleren</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
      </form>
    </Modal>
  );
}

function Tarieven({ klantId }: { klantId: number }) {
  const toast = useToast();
  const tarieven = useAsync(() => api.get<Tarief[]>(`/klanten/${klantId}/tarieven`), [klantId]);
  const functies = useAsync(() => api.get<Functie[]>('/functies'), []);
  const [functieId, setFunctieId] = useState('');
  const [bedrag, setBedrag] = useState('');
  const [vanaf, setVanaf] = useState(vandaag());
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bewerk, setBewerk] = useState<Tarief | null>(null);
  const [verwijder, setVerwijder] = useState<Tarief | null>(null);

  const huidig = huidigeTariefIds(tarieven.data ?? []);
  const actieveFuncties = (functies.data ?? []).filter((f) => f.actief);

  async function toevoegen(e: FormEvent) {
    e.preventDefault();
    const n = parseBedrag(bedrag);
    if (!functieId) return setFout('Kies een functie.');
    if (!Number.isFinite(n) || n < 0) return setFout('Vul een geldig uurtarief in.');
    setBusy(true);
    setFout(null);
    try {
      await api.post(`/klanten/${klantId}/tarieven`, { functieId: Number(functieId), uurTarief: n, geldigVanaf: vanaf });
      toast('Tarief toegevoegd.');
      setBedrag('');
      tarieven.reload();
    } catch (err) {
      setFout(err instanceof ApiError ? err.message : 'Toevoegen mislukt.');
    } finally {
      setBusy(false);
    }
  }

  async function verwijderen() {
    if (!verwijder) return;
    setBusy(true);
    try {
      await api.del(`/tarieven/${verwijder.tariefId}`);
      toast('Tarief verwijderd.');
      tarieven.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Verwijderen mislukt.', 'error');
    } finally {
      setBusy(false);
      setVerwijder(null);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Uurtarieven per functie</h2>
      <p className="muted">
        Een nieuw tarief geldt vanaf de ingangsdatum. Bij het registreren van uren wordt het dan geldende tarief vastgelegd,
        zodat een latere tariefwijziging eerder geboekte uren niet verandert.
      </p>

      <form className="filters tarief-add" onSubmit={toevoegen}>
        <label className="inline-field">
          <span>Functie</span>
          <select value={functieId} onChange={(e) => setFunctieId(e.target.value)} required>
            <option value="">Kies een functie…</option>
            {actieveFuncties.map((f) => <option key={f.functieId} value={f.functieId}>{f.naam}</option>)}
          </select>
        </label>
        <label className="inline-field">
          <span>Uurtarief (€)</span>
          <input inputMode="decimal" placeholder="bijv. 95,00" value={bedrag} onChange={(e) => setBedrag(e.target.value)} required />
        </label>
        <label className="inline-field">
          <span>Geldig vanaf</span>
          <input type="date" value={vanaf} onChange={(e) => setVanaf(e.target.value)} required />
        </label>
        <button type="submit" className="btn primary" disabled={busy}>Tarief toevoegen</button>
      </form>
      {functies.data && actieveFuncties.length === 0 && (
        <div className="alert warn">Er zijn nog geen functies. Maak die eerst aan onder <Link to="/instellingen" className="link">Instellingen</Link>.</div>
      )}
      {fout && <div className="alert error" role="alert">{fout}</div>}

      {tarieven.error && <ErrorBox message={tarieven.error} onRetry={tarieven.reload} />}
      {tarieven.loading && !tarieven.data && <Spinner />}
      {tarieven.data && tarieven.data.length === 0 && <Empty>Nog geen tarieven voor deze klant. Zonder tarief kunnen er geen uren op de projecten van deze klant worden geschreven.</Empty>}
      {tarieven.data && tarieven.data.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Functie</th><th className="num">Uurtarief</th><th>Geldig vanaf</th><th>Status</th><th className="num">Uurregels</th><th /></tr></thead>
            <tbody>
              {tarieven.data.map((t) => (
                <tr key={t.tariefId}>
                  <td><strong>{t.functieNaam}</strong></td>
                  <td className="num">{fmtEUR(t.uurTarief)}</td>
                  <td>{fmtDatum(t.geldigVanaf)}</td>
                  <td>
                    {huidig.has(t.tariefId) ? <Pill tone="gefactureerd">Huidig</Pill> : t.geldigVanaf > vandaag() ? <Pill tone="neutraal">Toekomstig</Pill> : <Pill tone="inactief">Vervangen</Pill>}
                  </td>
                  <td className="num">{t.aantalUren}</td>
                  <td className="actions">
                    <button type="button" className="link-btn" onClick={() => setBewerk(t)}>Wijzig</button>
                    {t.aantalUren === 0 && <button type="button" className="link-btn danger" onClick={() => setVerwijder(t)}>Verwijder</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bewerk && <TariefEditor tarief={bewerk} onClose={() => setBewerk(null)} onSaved={() => { setBewerk(null); tarieven.reload(); }} />}
      {verwijder && (
        <ConfirmModal title="Tarief verwijderen?" confirmLabel="Verwijderen" danger busy={busy} onClose={() => setVerwijder(null)} onConfirm={verwijderen}>
          <p>Het tarief van {fmtEUR(verwijder.uurTarief)} voor <strong>{verwijder.functieNaam}</strong> (vanaf {fmtDatum(verwijder.geldigVanaf)}) wordt verwijderd.</p>
        </ConfirmModal>
      )}
    </section>
  );
}

export default function KlantDetail({ id }: { id: number }) {
  const klant = useAsync(() => api.get<Klant>(`/klanten/${id}`), [id]);
  return (
    <>
      <PageHead eyebrow="Klant" title={klant.data?.naam ?? 'Klant'} sub={klant.data ? `${klant.data.actieveProjecten} actieve ${klant.data.actieveProjecten === 1 ? 'project' : 'projecten'}` : undefined}>
        <Link to="/klanten" className="btn ghost-light">← Alle klanten</Link>
        <Link to={`/projecten?klantId=${id}`} className="btn primary">Projecten van deze klant</Link>
      </PageHead>
      <Content>
        {klant.error && <ErrorBox message={klant.error} onRetry={klant.reload} />}
        {klant.loading && !klant.data && <Spinner />}
        {klant.data && (
          <section className="panel">
            <h2 className="panel-title">Gegevens</h2>
            <KlantForm key={klant.data.klantId + klant.data.naam} initial={klant.data} onSaved={() => klant.reload()} />
          </section>
        )}
        <Tarieven klantId={id} />
      </Content>
    </>
  );
}
