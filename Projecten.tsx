import { useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { fmtDatum, projectLabel } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { useLocation } from '../lib/router';
import type { Klant, Project, ProjectStatus } from '../lib/types';
import { Content, Empty, ErrorBox, Field, Modal, PageHead, Pill, Spinner, useToast } from '../components/ui';

const STATUSSEN: ProjectStatus[] = ['Actief', 'Afgerond', 'Gearchiveerd'];

function ProjectForm({
  initial, klanten, startKlantId, onSaved, onCancel,
}: { initial?: Project; klanten: Klant[]; startKlantId?: string; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [klantId, setKlantId] = useState(initial ? String(initial.klantId) : startKlantId ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [naam, setNaam] = useState(initial?.naam ?? '');
  const [omschrijving, setOmschrijving] = useState(initial?.omschrijving ?? '');
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? 'Actief');
  const [startDatum, setStartDatum] = useState(initial?.startDatum ?? '');
  const [eindDatum, setEindDatum] = useState(initial?.eindDatum ?? '');
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const klantVast = !!initial && initial.aantalUren > 0;

  async function opslaan(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFout(null);
    const body = {
      klantId: Number(klantId), code: code.trim() || null, naam: naam.trim(), omschrijving: omschrijving.trim() || null,
      status, startDatum: startDatum || null, eindDatum: eindDatum || null,
    };
    try {
      if (initial) await api.put(`/projecten/${initial.projectId}`, body);
      else await api.post('/projecten', body);
      toast(initial ? 'Project opgeslagen.' : 'Project aangemaakt.');
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
        <Field label="Klant *" hint={klantVast ? 'Vast: er zijn uren op dit project geregistreerd.' : undefined}>
          <select value={klantId} onChange={(e) => setKlantId(e.target.value)} required disabled={klantVast}>
            <option value="">Kies een klant…</option>
            {klanten.filter((k) => k.actief || String(k.klantId) === klantId).map((k) => <option key={k.klantId} value={k.klantId}>{k.naam}</option>)}
          </select>
        </Field>
        <Field label="Projectcode"><input value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} placeholder="optioneel" /></Field>
        <Field label="Naam project *" span={2}><input value={naam} onChange={(e) => setNaam(e.target.value)} required maxLength={200} /></Field>
        <Field label="Omschrijving" span={2}><textarea rows={3} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} maxLength={1000} /></Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {STATUSSEN.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <span />
        <Field label="Startdatum"><input type="date" value={startDatum} onChange={(e) => setStartDatum(e.target.value)} /></Field>
        <Field label="Einddatum"><input type="date" value={eindDatum} onChange={(e) => setEindDatum(e.target.value)} /></Field>
      </div>
      <p className="muted small">Alleen op projecten met status <strong>Actief</strong> kunnen uren worden geschreven.</p>
      {fout && <div className="alert error" role="alert">{fout}</div>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Annuleren</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
      </div>
    </form>
  );
}

export default function Projecten() {
  const { search } = useLocation();
  const [klantId, setKlantId] = useState(search.get('klantId') ?? '');
  const [status, setStatus] = useState('Actief');
  const [zoek, setZoek] = useState('');
  const [bewerk, setBewerk] = useState<Project | 'nieuw' | null>(null);

  const klanten = useAsync(() => api.get<Klant[]>('/klanten'), []);
  const projecten = useAsync(() => api.get<Project[]>('/projecten'), []);

  const rijen = useMemo(() => {
    const z = zoek.trim().toLowerCase();
    return (projecten.data ?? []).filter(
      (p) =>
        (!klantId || String(p.klantId) === klantId) &&
        (!status || p.status === status) &&
        (!z || `${p.naam} ${p.code ?? ''} ${p.klantNaam}`.toLowerCase().includes(z)),
    );
  }, [projecten.data, klantId, status, zoek]);

  return (
    <>
      <PageHead eyebrow="Stamgegevens" title="Projecten" sub="Maak projecten aan per klant en beheer hun status.">
        <button type="button" className="btn primary" onClick={() => setBewerk('nieuw')}>Nieuw project <span aria-hidden="true">＋</span></button>
      </PageHead>
      <Content>
        <div className="filters">
          <label className="inline-field">
            <span>Klant</span>
            <select value={klantId} onChange={(e) => setKlantId(e.target.value)}>
              <option value="">Alle klanten</option>
              {(klanten.data ?? []).map((k) => <option key={k.klantId} value={k.klantId}>{k.naam}</option>)}
            </select>
          </label>
          <label className="inline-field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Alle</option>
              {STATUSSEN.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="inline-field grow">
            <span>Zoeken</span>
            <input type="search" placeholder="Projectnaam, code of klant" value={zoek} onChange={(e) => setZoek(e.target.value)} />
          </label>
        </div>
        {projecten.error && <ErrorBox message={projecten.error} onRetry={projecten.reload} />}
        {projecten.loading && !projecten.data && <Spinner />}
        {projecten.data && rijen.length === 0 && (
          <Empty>{projecten.data.length === 0 ? 'Nog geen projecten. Maak eerst een klant aan en voeg daarna een project toe.' : 'Geen projecten gevonden.'}</Empty>
        )}
        {rijen.length > 0 && (
          <div className="table-wrap">
            <table className="data clickable">
              <thead>
                <tr><th>Project</th><th>Klant</th><th>Status</th><th>Looptijd</th><th className="num">Uurregels</th><th /></tr>
              </thead>
              <tbody>
                {rijen.map((p) => (
                  <tr key={p.projectId} onClick={() => setBewerk(p)}>
                    <td><strong>{projectLabel(p.code, p.naam)}</strong>{p.omschrijving && <div className="muted small">{p.omschrijving}</div>}</td>
                    <td>{p.klantNaam}</td>
                    <td><Pill tone={p.status === 'Actief' ? 'actief' : 'inactief'}>{p.status}</Pill></td>
                    <td className="nowrap">{p.startDatum ? fmtDatum(p.startDatum) : '—'} – {p.eindDatum ? fmtDatum(p.eindDatum) : '—'}</td>
                    <td className="num">{p.aantalUren}</td>
                    <td className="actions"><button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); setBewerk(p); }}>Wijzig</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Content>
      {bewerk && klanten.data && (
        <Modal title={bewerk === 'nieuw' ? 'Nieuw project' : 'Project wijzigen'} onClose={() => setBewerk(null)} wide>
          <ProjectForm
            initial={bewerk === 'nieuw' ? undefined : bewerk} klanten={klanten.data} startKlantId={klantId}
            onCancel={() => setBewerk(null)} onSaved={() => { setBewerk(null); projecten.reload(); }}
          />
        </Modal>
      )}
    </>
  );
}
