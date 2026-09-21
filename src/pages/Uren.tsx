import { useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, qs } from '../lib/api';
import {
  beginVanMaand, beginVanWeek, dagNaam, eindVanMaand, eindVanWeek, fmtDatum, fmtEUR, fmtUren, isoLokaal, projectLabel, vandaag,
} from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { Me, Uur, UrenOpties, UrenResponse } from '../lib/types';
import { ConfirmModal, Content, Empty, ErrorBox, Field, Modal, PageHead, Pill, Spinner, useToast } from '../components/ui';

type OptieProject = UrenOpties['projecten'][number];

/* ------------------------------------------------------------------ *
 *  Invoerformulier (nieuw + wijzigen)
 * ------------------------------------------------------------------ */
function UurForm({
  opties, me, initial, onSaved, onCancel,
}: {
  opties: UrenOpties; me: Me; initial?: Uur; onSaved: () => void; onCancel?: () => void;
}) {
  const isAdmin = me.rol === 'Admin';
  const toast = useToast();
  const [datum, setDatum] = useState(initial?.datum ?? vandaag());
  const [projectId, setProjectId] = useState<number | ''>(initial?.projectId ?? '');
  const [functieId, setFunctieId] = useState<number | ''>(initial?.functieId ?? '');
  const [aantal, setAantal] = useState(initial ? String(initial.aantal).replace('.', ',') : '');
  const [omschrijving, setOmschrijving] = useState(initial?.omschrijving ?? '');
  const [medewerkerId, setMedewerkerId] = useState<number>(initial?.medewerkerId ?? me.medewerkerId);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  // Bij wijzigen kan het project inmiddels niet meer actief zijn: toch tonen.
  const projecten = useMemo<OptieProject[]>(() => {
    if (initial && !opties.projecten.some((p) => p.projectId === initial.projectId)) {
      return [
        ...opties.projecten,
        {
          projectId: initial.projectId, code: initial.projectCode, naam: initial.projectNaam,
          klantId: initial.klantId, klantNaam: initial.klantNaam,
          functies: [{ functieId: initial.functieId, naam: initial.functieNaam }],
        },
      ];
    }
    return opties.projecten;
  }, [opties, initial]);

  const project = projecten.find((p) => p.projectId === projectId);
  const perKlant = useMemo(() => {
    const m = new Map<string, OptieProject[]>();
    for (const p of projecten) m.set(p.klantNaam, [...(m.get(p.klantNaam) ?? []), p]);
    return [...m.entries()];
  }, [projecten]);

  function kiesProject(id: number | '') {
    setProjectId(id);
    const p = projecten.find((x) => x.projectId === id);
    if (!p) return setFunctieId('');
    const ids = p.functies.map((f) => f.functieId);
    if (functieId !== '' && ids.includes(functieId)) return;
    const standaard = opties.standaardFunctieId;
    setFunctieId(standaard && ids.includes(standaard) ? standaard : ids[0] ?? '');
  }

  async function opslaan(e: FormEvent) {
    e.preventDefault();
    setFout(null);
    const uren = Number(aantal.replace(',', '.'));
    if (projectId === '' || functieId === '') return setFout('Kies een project en een functie.');
    if (!Number.isFinite(uren) || uren <= 0 || uren > 24) return setFout('Vul een aantal uren in tussen 0,01 en 24.');
    setBusy(true);
    try {
      const body = {
        datum, projectId, functieId, aantal: uren, omschrijving: omschrijving.trim() || null,
        ...(isAdmin ? { medewerkerId } : {}),
      };
      if (initial) await api.put(`/uren/${initial.uurId}`, body);
      else await api.post('/uren', body);
      toast(initial ? 'Uren gewijzigd.' : 'Uren opgeslagen.');
      if (!initial) {
        setAantal('');
        setOmschrijving('');
      }
      onSaved();
    } catch (err) {
      setFout(err instanceof ApiError ? err.message : 'Opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="entry" onSubmit={opslaan}>
      <div className="entry-row">
        <Field label="Datum" className="f-datum">
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} required />
        </Field>
        {isAdmin && opties.medewerkers && (
          <Field label="Medewerker" className="f-med">
            <select value={medewerkerId} onChange={(e) => setMedewerkerId(Number(e.target.value))}>
              {opties.medewerkers.map((m) => <option key={m.medewerkerId} value={m.medewerkerId}>{m.naam}</option>)}
            </select>
          </Field>
        )}
        <Field label="Project" className="f-project">
          <select value={projectId} onChange={(e) => kiesProject(e.target.value ? Number(e.target.value) : '')} required>
            <option value="">Kies een project…</option>
            {perKlant.map(([klant, lijst]) => (
              <optgroup key={klant} label={klant}>
                {lijst.map((p) => <option key={p.projectId} value={p.projectId}>{projectLabel(p.code, p.naam)}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Functie" className="f-functie">
          <select value={functieId} onChange={(e) => setFunctieId(e.target.value ? Number(e.target.value) : '')} required disabled={!project}>
            <option value="">{project ? 'Kies een functie…' : '—'}</option>
            {project?.functies.map((f) => <option key={f.functieId} value={f.functieId}>{f.naam}</option>)}
          </select>
        </Field>
        <Field label="Uren" className="f-uren">
          <input
            type="text" inputMode="decimal" placeholder="bijv. 7,5" value={aantal}
            onChange={(e) => setAantal(e.target.value)} required
          />
        </Field>
        <Field label="Omschrijving" className="f-omschr">
          <input type="text" maxLength={500} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} placeholder="Waar heb je aan gewerkt?" />
        </Field>
      </div>
      {project && project.functies.length === 0 && (
        <div className="alert warn">Voor de klant van dit project is nog geen tarief ingesteld. Vraag de beheerder een tarief toe te voegen.</div>
      )}
      {fout && <div className="alert error" role="alert">{fout}</div>}
      <div className="form-actions">
        {onCancel && <button type="button" className="btn" onClick={onCancel} disabled={busy}>Annuleren</button>}
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Opslaan…' : initial ? 'Wijzigingen opslaan' : 'Uren opslaan'}</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 *  Pagina
 * ------------------------------------------------------------------ */
type Periode = 'week' | 'maand' | 'vorige' | 'alles' | 'eigen';

function bereik(p: Periode, van: string, tot: string): { van: string | null; tot: string | null } {
  const nu = new Date();
  if (p === 'week') return { van: beginVanWeek(nu), tot: eindVanWeek(nu) };
  if (p === 'maand') return { van: beginVanMaand(nu), tot: eindVanMaand(nu) };
  if (p === 'vorige') {
    const d = new Date(nu.getFullYear(), nu.getMonth() - 1, 1);
    return { van: isoLokaal(d), tot: eindVanMaand(d) };
  }
  if (p === 'eigen') return { van: van || null, tot: tot || null };
  return { van: null, tot: null };
}

export default function Uren({ me }: { me: Me }) {
  const isAdmin = me.rol === 'Admin';
  const toast = useToast();
  const [periode, setPeriode] = useState<Periode>('maand');
  const [eigenVan, setEigenVan] = useState('');
  const [eigenTot, setEigenTot] = useState('');
  const [projectId, setProjectId] = useState('');
  const [medewerkerId, setMedewerkerId] = useState('');
  const [status, setStatus] = useState<'alle' | 'open' | 'gefactureerd'>('alle');
  const [bewerk, setBewerk] = useState<Uur | null>(null);
  const [verwijder, setVerwijder] = useState<Uur | null>(null);
  const [bezig, setBezig] = useState(false);

  const opties = useAsync(() => api.get<UrenOpties>('/uren/opties'), []);
  const { van, tot } = bereik(periode, eigenVan, eigenTot);
  const lijst = useAsync(
    () => api.get<UrenResponse>(`/uren${qs({ van, tot, projectId, medewerkerId: isAdmin ? medewerkerId : null, status })}`),
    [van, tot, projectId, medewerkerId, status],
  );

  const uren = lijst.data?.uren ?? [];
  const totaalUren = uren.reduce((s, u) => s + u.aantal, 0);
  const totaalBedrag = uren.reduce((s, u) => s + (u.bedrag ?? 0), 0);

  async function verwijderen() {
    if (!verwijder) return;
    setBezig(true);
    try {
      await api.del(`/uren/${verwijder.uurId}`);
      toast('Uren verwijderd.');
      setVerwijder(null);
      lijst.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Verwijderen mislukt.', 'error');
      setVerwijder(null);
      lijst.reload();
    } finally {
      setBezig(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow={isAdmin ? 'Urenregistratie' : `Welkom, ${me.naam.split(' ')[0]}`}
        title={isAdmin ? 'Uren' : 'Mijn uren'}
        sub={isAdmin ? 'Registreer uren en bekijk alle geboekte uren van jou en je medewerkers.' : 'Vul hier je uren in. Je ziet en wijzigt alleen je eigen uren.'}
      />
      <Content>
        <section className="panel">
          <h2 className="panel-title">Uren registreren</h2>
          {opties.error && <ErrorBox message={opties.error} onRetry={opties.reload} />}
          {opties.loading && !opties.data && <Spinner />}
          {opties.data && (
            opties.data.projecten.length === 0 ? (
              <Empty>Er zijn nog geen actieve projecten.{isAdmin ? ' Maak eerst een klant, tarieven en een project aan.' : ' Vraag de beheerder een project aan te maken.'}</Empty>
            ) : (
              <UurForm opties={opties.data} me={me} onSaved={lijst.reload} />
            )
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Geboekte uren</h2>
            <div className="totals">
              <span><strong>{fmtUren(totaalUren)}</strong> uur</span>
              {isAdmin && <span><strong>{fmtEUR(totaalBedrag)}</strong></span>}
            </div>
          </div>

          <div className="filters">
            <label className="inline-field">
              <span>Periode</span>
              <select value={periode} onChange={(e) => setPeriode(e.target.value as Periode)}>
                <option value="week">Deze week</option>
                <option value="maand">Deze maand</option>
                <option value="vorige">Vorige maand</option>
                <option value="alles">Alles</option>
                <option value="eigen">Eigen periode…</option>
              </select>
            </label>
            {periode === 'eigen' && (
              <>
                <label className="inline-field"><span>Van</span><input type="date" value={eigenVan} onChange={(e) => setEigenVan(e.target.value)} /></label>
                <label className="inline-field"><span>Tot en met</span><input type="date" value={eigenTot} onChange={(e) => setEigenTot(e.target.value)} /></label>
              </>
            )}
            <label className="inline-field">
              <span>Project</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Alle projecten</option>
                {(opties.data?.projecten ?? []).map((p) => (
                  <option key={p.projectId} value={p.projectId}>{p.klantNaam} — {projectLabel(p.code, p.naam)}</option>
                ))}
              </select>
            </label>
            {isAdmin && (
              <label className="inline-field">
                <span>Medewerker</span>
                <select value={medewerkerId} onChange={(e) => setMedewerkerId(e.target.value)}>
                  <option value="">Iedereen</option>
                  {(opties.data?.medewerkers ?? []).map((m) => <option key={m.medewerkerId} value={m.medewerkerId}>{m.naam}</option>)}
                </select>
              </label>
            )}
            <label className="inline-field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="alle">Alle</option>
                <option value="open">Niet gefactureerd</option>
                <option value="gefactureerd">Gefactureerd</option>
              </select>
            </label>
          </div>

          {lijst.error && <ErrorBox message={lijst.error} onRetry={lijst.reload} />}
          {lijst.loading && !lijst.data && <Spinner />}
          {lijst.data?.afgekapt && (
            <div className="alert warn">Er zijn meer dan 5.000 uren gevonden; alleen de nieuwste worden getoond. Verklein de periode.</div>
          )}
          {lijst.data && uren.length === 0 && <Empty>Geen uren gevonden voor deze selectie.</Empty>}
          {uren.length > 0 && (
            <div className={`table-wrap${lijst.loading ? ' dim' : ''}`}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Datum</th>
                    {isAdmin && <th>Medewerker</th>}
                    <th>Project</th>
                    <th>Functie</th>
                    <th>Omschrijving</th>
                    <th className="num">Uren</th>
                    {isAdmin && <th className="num">Tarief</th>}
                    {isAdmin && <th className="num">Bedrag</th>}
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {uren.map((u) => (
                    <tr key={u.uurId}>
                      <td className="nowrap"><span className="muted">{dagNaam(u.datum)}</span> {fmtDatum(u.datum)}</td>
                      {isAdmin && <td>{u.medewerkerNaam}</td>}
                      <td>
                        <div>{projectLabel(u.projectCode, u.projectNaam)}</div>
                        <div className="muted small">{u.klantNaam}</div>
                      </td>
                      <td>{u.functieNaam}</td>
                      <td className="wrap">{u.omschrijving}</td>
                      <td className="num">{fmtUren(u.aantal)}</td>
                      {isAdmin && <td className="num">{fmtEUR(u.uurTarief)}</td>}
                      {isAdmin && <td className="num">{fmtEUR(u.bedrag)}</td>}
                      <td>
                        {u.facturatieId === null ? (
                          <Pill tone="open">Niet gefactureerd</Pill>
                        ) : (
                          <Pill tone="gefactureerd">Gefactureerd</Pill>
                        )}
                      </td>
                      <td className="actions">
                        {u.facturatieId === null && (
                          <>
                            <button type="button" className="link-btn" onClick={() => setBewerk(u)}>Wijzig</button>
                            <button type="button" className="link-btn danger" onClick={() => setVerwijder(u)}>Verwijder</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Content>

      {bewerk && opties.data && (
        <Modal title="Uren wijzigen" onClose={() => setBewerk(null)} wide>
          <UurForm
            opties={opties.data} me={me} initial={bewerk}
            onCancel={() => setBewerk(null)}
            onSaved={() => { setBewerk(null); lijst.reload(); }}
          />
        </Modal>
      )}
      {verwijder && (
        <ConfirmModal
          title="Uren verwijderen?" confirmLabel="Verwijderen" danger busy={bezig}
          onClose={() => setVerwijder(null)} onConfirm={verwijderen}
        >
          <p>
            {fmtUren(verwijder.aantal)} uur op <strong>{fmtDatum(verwijder.datum)}</strong> voor{' '}
            <strong>{projectLabel(verwijder.projectCode, verwijder.projectNaam)}</strong> wordt definitief verwijderd.
          </p>
        </ConfirmModal>
      )}
    </>
  );
}
