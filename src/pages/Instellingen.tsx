import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useAsync } from '../lib/hooks';
import type { Functie, Me, Medewerker, Rol } from '../lib/types';
import { Content, Empty, ErrorBox, Field, Modal, PageHead, Pill, Spinner, Tabs, useToast } from '../components/ui';

/* ---------------------------- Medewerkers ---------------------------- */
function MedewerkerForm({
  initial, functies, ikzelf, onSaved, onCancel,
}: { initial?: Medewerker; functies: Functie[]; ikzelf: boolean; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState(initial?.email ?? '');
  const [naam, setNaam] = useState(initial?.naam ?? '');
  const [rol, setRol] = useState<Rol>(initial?.rol ?? 'Medewerker');
  const [functieId, setFunctieId] = useState(initial?.standaardFunctieId ? String(initial.standaardFunctieId) : '');
  const [actief, setActief] = useState(initial?.actief ?? true);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function opslaan(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFout(null);
    const body = { email: email.trim(), naam: naam.trim(), rol, standaardFunctieId: functieId ? Number(functieId) : null, actief };
    try {
      if (initial) await api.put(`/medewerkers/${initial.medewerkerId}`, body);
      else await api.post('/medewerkers', body);
      toast(initial ? 'Medewerker opgeslagen.' : 'Medewerker toegevoegd. Deze persoon kan nu inloggen.');
      onSaved();
    } catch (err) {
      setFout(err instanceof ApiError ? err.message : 'Opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={opslaan}>
      <div className="form-grid">
        <Field label="E-mailadres (inlognaam) *" span={2} hint="Moet gelijk zijn aan het Microsoft-account waarmee deze persoon inlogt.">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={ikzelf} maxLength={320} />
        </Field>
        <Field label="Naam *"><input value={naam} onChange={(e) => setNaam(e.target.value)} required maxLength={200} /></Field>
        <Field label="Standaardfunctie">
          <select value={functieId} onChange={(e) => setFunctieId(e.target.value)}>
            <option value="">— geen —</option>
            {functies.filter((f) => f.actief || String(f.functieId) === functieId).map((f) => <option key={f.functieId} value={f.functieId}>{f.naam}</option>)}
          </select>
        </Field>
        <Field label="Rol" hint={rol === 'Admin' ? 'Beheerder: alles, inclusief klanten, tarieven, projecten en facturatie.' : 'Medewerker: alleen eigen uren invullen; geen toegang tot tarieven of bedragen.'}>
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} disabled={ikzelf}>
            <option value="Medewerker">Medewerker</option>
            <option value="Admin">Beheerder</option>
          </select>
        </Field>
        <label className="check-field">
          <input type="checkbox" checked={actief} onChange={(e) => setActief(e.target.checked)} disabled={ikzelf} />
          <span>Actief (mag inloggen)</span>
        </label>
      </div>
      {ikzelf && <p className="muted small">Je eigen e-mailadres, rol en status kun je niet wijzigen.</p>}
      {fout && <div className="alert error" role="alert">{fout}</div>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Annuleren</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
      </div>
    </form>
  );
}

function Medewerkers({ me }: { me: Me }) {
  const lijst = useAsync(() => api.get<Medewerker[]>('/medewerkers'), []);
  const functies = useAsync(() => api.get<Functie[]>('/functies'), []);
  const [bewerk, setBewerk] = useState<Medewerker | 'nieuw' | null>(null);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Medewerkers en toegang</h2>
        <button type="button" className="btn primary" onClick={() => setBewerk('nieuw')}>Medewerker toevoegen <span aria-hidden="true">＋</span></button>
      </div>
      <p className="muted">
        Medewerkers loggen in met hun Microsoft-account van jullie organisatie. Voeg hier hun e-mailadres toe om toegang te geven;
        een medewerker ziet uitsluitend het scherm <em>Mijn uren</em> en kan geen klanten, projecten of tarieven wijzigen of inzien.
      </p>
      {lijst.error && <ErrorBox message={lijst.error} onRetry={lijst.reload} />}
      {lijst.loading && !lijst.data && <Spinner />}
      {lijst.data && lijst.data.length === 0 && <Empty>Nog geen medewerkers.</Empty>}
      {lijst.data && lijst.data.length > 0 && (
        <div className="table-wrap">
          <table className="data clickable">
            <thead><tr><th>Naam</th><th>E-mail</th><th>Rol</th><th>Standaardfunctie</th><th>Status</th><th /></tr></thead>
            <tbody>
              {lijst.data.map((m) => (
                <tr key={m.medewerkerId} onClick={() => setBewerk(m)}>
                  <td><strong>{m.naam}</strong>{m.medewerkerId === me.medewerkerId && <span className="muted"> (jij)</span>}</td>
                  <td>{m.email}</td>
                  <td>{m.rol === 'Admin' ? 'Beheerder' : 'Medewerker'}</td>
                  <td>{m.standaardFunctieNaam ?? <span className="muted">—</span>}</td>
                  <td><Pill tone={m.actief ? 'actief' : 'inactief'}>{m.actief ? 'Actief' : 'Niet actief'}</Pill></td>
                  <td className="actions"><button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); setBewerk(m); }}>Wijzig</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {bewerk && functies.data && (
        <Modal title={bewerk === 'nieuw' ? 'Medewerker toevoegen' : 'Medewerker wijzigen'} onClose={() => setBewerk(null)} wide>
          <MedewerkerForm
            initial={bewerk === 'nieuw' ? undefined : bewerk} functies={functies.data}
            ikzelf={bewerk !== 'nieuw' && bewerk.medewerkerId === me.medewerkerId}
            onCancel={() => setBewerk(null)} onSaved={() => { setBewerk(null); lijst.reload(); }}
          />
        </Modal>
      )}
    </section>
  );
}

/* ---------------------------- Functies ---------------------------- */
function FunctieForm({ initial, onSaved, onCancel }: { initial?: Functie; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [naam, setNaam] = useState(initial?.naam ?? '');
  const [actief, setActief] = useState(initial?.actief ?? true);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function opslaan(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFout(null);
    try {
      if (initial) await api.put(`/functies/${initial.functieId}`, { naam: naam.trim(), actief });
      else await api.post('/functies', { naam: naam.trim(), actief });
      toast('Functie opgeslagen.');
      onSaved();
    } catch (err) {
      setFout(err instanceof ApiError ? err.message : 'Opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={opslaan}>
      <div className="form-grid">
        <Field label="Naam functie *" span={2}><input value={naam} onChange={(e) => setNaam(e.target.value)} required maxLength={100} placeholder="bijv. Senior consultant" /></Field>
        <label className="check-field span2">
          <input type="checkbox" checked={actief} onChange={(e) => setActief(e.target.checked)} />
          <span>Actief (niet-actieve functies zijn niet meer te kiezen bij het registreren van uren)</span>
        </label>
      </div>
      {fout && <div className="alert error" role="alert">{fout}</div>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Annuleren</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
      </div>
    </form>
  );
}

function Functies() {
  const lijst = useAsync(() => api.get<Functie[]>('/functies'), []);
  const [bewerk, setBewerk] = useState<Functie | 'nieuw' | null>(null);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Functies</h2>
        <button type="button" className="btn primary" onClick={() => setBewerk('nieuw')}>Functie toevoegen <span aria-hidden="true">＋</span></button>
      </div>
      <p className="muted">Functies (bijv. Consultant, Senior consultant) zijn de basis voor de tarieven. Het tarief per klant stel je in bij <em>Klanten</em>.</p>
      {lijst.error && <ErrorBox message={lijst.error} onRetry={lijst.reload} />}
      {lijst.loading && !lijst.data && <Spinner />}
      {lijst.data && lijst.data.length === 0 && <Empty>Nog geen functies. Voeg je eerste functie toe.</Empty>}
      {lijst.data && lijst.data.length > 0 && (
        <div className="table-wrap narrow">
          <table className="data clickable">
            <thead><tr><th>Functie</th><th>Status</th><th /></tr></thead>
            <tbody>
              {lijst.data.map((f) => (
                <tr key={f.functieId} onClick={() => setBewerk(f)}>
                  <td><strong>{f.naam}</strong></td>
                  <td><Pill tone={f.actief ? 'actief' : 'inactief'}>{f.actief ? 'Actief' : 'Niet actief'}</Pill></td>
                  <td className="actions"><button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); setBewerk(f); }}>Wijzig</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {bewerk && (
        <Modal title={bewerk === 'nieuw' ? 'Functie toevoegen' : 'Functie wijzigen'} onClose={() => setBewerk(null)}>
          <FunctieForm initial={bewerk === 'nieuw' ? undefined : bewerk} onCancel={() => setBewerk(null)} onSaved={() => { setBewerk(null); lijst.reload(); }} />
        </Modal>
      )}
    </section>
  );
}

export default function Instellingen({ me }: { me: Me }) {
  const [tab, setTab] = useState<'medewerkers' | 'functies'>('medewerkers');
  return (
    <>
      <PageHead eyebrow="Beheer" title="Instellingen" sub="Geef medewerkers toegang en beheer de functies waarvoor je tarieven instelt." />
      <Content>
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'medewerkers', label: 'Medewerkers' }, { id: 'functies', label: 'Functies' }]} />
        {tab === 'medewerkers' ? <Medewerkers me={me} /> : <Functies />}
      </Content>
    </>
  );
}
