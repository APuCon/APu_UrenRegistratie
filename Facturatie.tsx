import { useEffect, useMemo, useState } from 'react';
import SamenvattingTabel from '../components/SamenvattingTabel';
import { api, ApiError, qs } from '../lib/api';
import { fmtDatum, fmtEUR, fmtUren, projectLabel, vandaag } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { useLocation } from '../lib/router';
import { maakSamenvatting } from '../lib/samenvatting';
import type {
  Facturatie as FacturatieRij, FacturatieDetail, FacturatieResultaat, Klant, Project, UrenOpties, UrenResponse,
} from '../lib/types';
import { ConfirmModal, Content, Empty, ErrorBox, Field, Modal, PageHead, Spinner, Tabs, useToast } from '../components/ui';

/* ------------------------------------------------------------------ *
 *  Tab 1: uren selecteren en als gefactureerd markeren
 * ------------------------------------------------------------------ */
function TeFactureren({ startKlant }: { startKlant: string }) {
  const toast = useToast();
  const [klantId, setKlantId] = useState(startKlant);
  const [projectId, setProjectId] = useState('');
  const [medewerkerId, setMedewerkerId] = useState('');
  const [van, setVan] = useState('');
  const [tot, setTot] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bevestig, setBevestig] = useState(false);
  const [factuurDatum, setFactuurDatum] = useState(vandaag());
  const [referentie, setReferentie] = useState('');
  const [opmerking, setOpmerking] = useState('');
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const klanten = useAsync(() => api.get<Klant[]>('/klanten'), []);
  const projecten = useAsync(() => api.get<Project[]>('/projecten'), []);
  const opties = useAsync(() => api.get<UrenOpties>('/uren/opties'), []);
  const lijst = useAsync(
    () => api.get<UrenResponse>(`/uren${qs({ status: 'open', klantId, projectId, medewerkerId, van, tot })}`),
    [klantId, projectId, medewerkerId, van, tot],
  );

  const rijen = useMemo(() => lijst.data?.uren ?? [], [lijst.data]);

  // Selectie opschonen wanneer de lijst verandert (bijv. na filteren of factureren).
  useEffect(() => {
    const ids = new Set(rijen.map((r) => r.uurId));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rijen]);

  const gekozen = useMemo(() => rijen.filter((r) => selected.has(r.uurId)), [rijen, selected]);
  const samenvatting = useMemo(() => maakSamenvatting(gekozen), [gekozen]);
  const alleGekozen = rijen.length > 0 && gekozen.length === rijen.length;
  const totaalOpen = rijen.reduce((s, r) => s + (r.bedrag ?? 0), 0);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const toggleAlles = () => setSelected(alleGekozen ? new Set() : new Set(rijen.map((r) => r.uurId)));

  const projectOpties = (projecten.data ?? []).filter((p) => !klantId || String(p.klantId) === klantId);

  async function factureer() {
    setBusy(true);
    setFout(null);
    try {
      const res = await api.post<FacturatieResultaat>('/facturaties', {
        uurIds: gekozen.map((r) => r.uurId),
        factuurDatum,
        referentie: referentie.trim() || null,
        opmerking: opmerking.trim() || null,
      });
      toast(
        `${res.samenvatting.aantalRegels} uurregels (${fmtUren(res.samenvatting.totaalUren)} uur, ${fmtEUR(res.samenvatting.totaalBedrag)}) gemarkeerd als gefactureerd.`,
      );
      setBevestig(false);
      setSelected(new Set());
      setReferentie('');
      setOpmerking('');
      lijst.reload();
    } catch (e) {
      setFout(e instanceof ApiError ? e.message : 'Factureren mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="filters">
        <label className="inline-field">
          <span>Klant</span>
          <select value={klantId} onChange={(e) => { setKlantId(e.target.value); setProjectId(''); }}>
            <option value="">Alle klanten</option>
            {(klanten.data ?? []).map((k) => <option key={k.klantId} value={k.klantId}>{k.naam}</option>)}
          </select>
        </label>
        <label className="inline-field">
          <span>Project</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Alle projecten</option>
            {projectOpties.map((p) => <option key={p.projectId} value={p.projectId}>{klantId ? '' : `${p.klantNaam} — `}{projectLabel(p.code, p.naam)}</option>)}
          </select>
        </label>
        <label className="inline-field">
          <span>Medewerker</span>
          <select value={medewerkerId} onChange={(e) => setMedewerkerId(e.target.value)}>
            <option value="">Iedereen</option>
            {(opties.data?.medewerkers ?? []).map((m) => <option key={m.medewerkerId} value={m.medewerkerId}>{m.naam}</option>)}
          </select>
        </label>
        <label className="inline-field"><span>Uren van</span><input type="date" value={van} onChange={(e) => setVan(e.target.value)} /></label>
        <label className="inline-field"><span>Tot en met</span><input type="date" value={tot} onChange={(e) => setTot(e.target.value)} /></label>
      </div>

      {lijst.error && <ErrorBox message={lijst.error} onRetry={lijst.reload} />}
      {lijst.loading && !lijst.data && <Spinner />}
      {lijst.data?.afgekapt && (
        <div className="alert warn">Er zijn meer dan 5.000 openstaande uren; alleen de nieuwste worden getoond. Filter op klant of periode.</div>
      )}

      {lijst.data && rijen.length === 0 && <Empty>Geen niet-gefactureerde uren gevonden voor deze selectie.</Empty>}

      {rijen.length > 0 && (
        <div className="split">
          <div className="split-main">
            <div className="table-tools">
              <span className="muted">{rijen.length} openstaande uurregels · {fmtEUR(totaalOpen)}</span>
            </div>
            <div className={`table-wrap${lijst.loading ? ' dim' : ''}`}>
              <table className="data selectable">
                <thead>
                  <tr>
                    <th className="check">
                      <input type="checkbox" checked={alleGekozen} onChange={toggleAlles} aria-label="Alle uren selecteren" />
                    </th>
                    <th>Datum</th>
                    <th>Project</th>
                    <th>Functie / medewerker</th>
                    <th className="num">Uren</th>
                    <th className="num">Tarief</th>
                    <th className="num">Bedrag</th>
                  </tr>
                </thead>
                <tbody>
                  {rijen.map((r) => (
                    <tr key={r.uurId} className={selected.has(r.uurId) ? 'selected' : ''} onClick={() => toggle(r.uurId)}>
                      <td className="check">
                        <input
                          type="checkbox" checked={selected.has(r.uurId)} onChange={() => toggle(r.uurId)}
                          onClick={(e) => e.stopPropagation()} aria-label={`Selecteer ${fmtDatum(r.datum)} ${r.projectNaam}`}
                        />
                      </td>
                      <td className="nowrap">{fmtDatum(r.datum)}</td>
                      <td>
                        <div>{projectLabel(r.projectCode, r.projectNaam)}</div>
                        <div className="muted small">{r.klantNaam}{r.omschrijving ? ` · ${r.omschrijving}` : ''}</div>
                      </td>
                      <td>
                        <div>{r.functieNaam}</div>
                        <div className="muted small">{r.medewerkerNaam}</div>
                      </td>
                      <td className="num">{fmtUren(r.aantal)}</td>
                      <td className="num">{fmtEUR(r.uurTarief)}</td>
                      <td className="num">{fmtEUR(r.bedrag)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="split-side" aria-label="Samenvatting van de selectie">
            <div className="summary-card">
              <div className="eyebrow dark">Selectie</div>
              {gekozen.length === 0 ? (
                <p className="muted">Vink uren aan om per project en functie het totaal aantal uren en het bedrag te zien.</p>
              ) : (
                <>
                  <p className="summary-count">
                    <strong>{gekozen.length}</strong> van {rijen.length} uurregels geselecteerd
                  </p>
                  <SamenvattingTabel s={samenvatting} />
                  <button type="button" className="btn primary block" onClick={() => { setFout(null); setBevestig(true); }}>
                    Markeer als gefactureerd…
                  </button>
                  <button type="button" className="btn ghost block" onClick={() => setSelected(new Set())}>Selectie wissen</button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      {bevestig && (
        <Modal
          title="Markeren als gefactureerd" wide onClose={() => !busy && setBevestig(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setBevestig(false)} disabled={busy}>Annuleren</button>
              <button type="button" className="btn primary" onClick={factureer} disabled={busy}>
                {busy ? 'Bezig…' : `Bevestig: ${fmtEUR(samenvatting.totaalBedrag)} gefactureerd`}
              </button>
            </>
          }
        >
          <p>Je staat op het punt <strong>{gekozen.length} uurregels</strong> als gefactureerd te markeren. Controleer het overzicht:</p>
          <SamenvattingTabel s={samenvatting} />
          {samenvatting.klanten.length > 1 && (
            <div className="alert info">
              De selectie bevat {samenvatting.klanten.length} klanten: er wordt per klant een aparte facturatie vastgelegd.
            </div>
          )}
          <div className="form-grid">
            <Field label="Factuurdatum">
              <input type="date" value={factuurDatum} onChange={(e) => setFactuurDatum(e.target.value)} required />
            </Field>
            <Field label="Factuurnummer / referentie (optioneel)">
              <input type="text" maxLength={100} value={referentie} onChange={(e) => setReferentie(e.target.value)} placeholder="bijv. 2026-0142" />
            </Field>
            <Field label="Opmerking (optioneel)" span={2}>
              <input type="text" maxLength={500} value={opmerking} onChange={(e) => setOpmerking(e.target.value)} />
            </Field>
          </div>
          {fout && <div className="alert error" role="alert">{fout}</div>}
        </Modal>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 *  Tab 2: historie
 * ------------------------------------------------------------------ */
function Detail({ id, onTerugdraaien }: { id: number; onTerugdraaien: (f: FacturatieDetail) => void }) {
  const d = useAsync(() => api.get<FacturatieDetail>(`/facturaties/${id}`), [id]);
  if (d.loading) return <Spinner />;
  if (d.error || !d.data) return <ErrorBox message={d.error ?? 'Niet gevonden'} onRetry={d.reload} />;
  const f = d.data;
  return (
    <div className="detail">
      {f.opmerking && <p className="muted">Opmerking: {f.opmerking}</p>}
      <SamenvattingTabel s={f.samenvatting} />
      <div className="table-wrap">
        <table className="data compact">
          <thead>
            <tr><th>Datum</th><th>Project</th><th>Functie</th><th>Medewerker</th><th>Omschrijving</th><th className="num">Uren</th><th className="num">Bedrag</th></tr>
          </thead>
          <tbody>
            {f.regels.map((r) => (
              <tr key={r.uurId}>
                <td className="nowrap">{fmtDatum(r.datum)}</td>
                <td>{projectLabel(r.projectCode, r.projectNaam)}</td>
                <td>{r.functieNaam}</td>
                <td>{r.medewerkerNaam}</td>
                <td className="wrap">{r.omschrijving}</td>
                <td className="num">{fmtUren(r.aantal)}</td>
                <td className="num">{fmtEUR(r.bedrag)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions left">
        <button type="button" className="btn danger-outline" onClick={() => onTerugdraaien(f)}>Facturatie terugdraaien…</button>
      </div>
    </div>
  );
}

function Historie() {
  const toast = useToast();
  const [klantId, setKlantId] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [terug, setTerug] = useState<FacturatieDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const klanten = useAsync(() => api.get<Klant[]>('/klanten'), []);
  const lijst = useAsync(() => api.get<FacturatieRij[]>(`/facturaties${qs({ klantId })}`), [klantId]);

  async function terugdraaien() {
    if (!terug) return;
    setBusy(true);
    try {
      const r = await api.post<{ teruggedraaideUren: number }>(`/facturaties/${terug.facturatieId}/terugdraaien`);
      toast(`${r.teruggedraaideUren} uurregels staan weer op 'niet gefactureerd'.`);
      setTerug(null);
      setOpen(null);
      lijst.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Terugdraaien mislukt.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="filters">
        <label className="inline-field">
          <span>Klant</span>
          <select value={klantId} onChange={(e) => setKlantId(e.target.value)}>
            <option value="">Alle klanten</option>
            {(klanten.data ?? []).map((k) => <option key={k.klantId} value={k.klantId}>{k.naam}</option>)}
          </select>
        </label>
      </div>
      {lijst.error && <ErrorBox message={lijst.error} onRetry={lijst.reload} />}
      {lijst.loading && !lijst.data && <Spinner />}
      {lijst.data && lijst.data.length === 0 && <Empty>Nog geen uren als gefactureerd gemarkeerd.</Empty>}
      {lijst.data && lijst.data.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Factuurdatum</th><th>Klant</th><th>Referentie</th>
                <th className="num">Regels</th><th className="num">Uren</th><th className="num">Bedrag</th>
                <th>Vastgelegd door</th><th />
              </tr>
            </thead>
            <tbody>
              {lijst.data.map((f) => (
                <FacturatieRijen
                  key={f.facturatieId} f={f} open={open === f.facturatieId}
                  onToggle={() => setOpen(open === f.facturatieId ? null : f.facturatieId)}
                  onTerugdraaien={setTerug}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {terug && (
        <ConfirmModal
          title="Facturatie terugdraaien?" confirmLabel="Terugdraaien" danger busy={busy}
          onClose={() => setTerug(null)} onConfirm={terugdraaien}
        >
          <p>
            Alle {terug.aantalRegels} uurregels van <strong>{terug.klantNaam}</strong>
            {terug.referentie ? <> (referentie <strong>{terug.referentie}</strong>)</> : null} van {fmtDatum(terug.factuurDatum)}{' '}
            ({fmtEUR(terug.totaalBedrag)}) worden weer 'niet gefactureerd'. De facturatie zelf wordt verwijderd.
          </p>
        </ConfirmModal>
      )}
    </>
  );
}

function FacturatieRijen({
  f, open, onToggle, onTerugdraaien,
}: { f: FacturatieRij; open: boolean; onToggle: () => void; onTerugdraaien: (d: FacturatieDetail) => void }) {
  return (
    <>
      <tr className="group-row">
        <td className="nowrap">{fmtDatum(f.factuurDatum)}</td>
        <td><strong>{f.klantNaam}</strong></td>
        <td>{f.referentie ?? <span className="muted">—</span>}</td>
        <td className="num">{f.aantalRegels}</td>
        <td className="num">{fmtUren(f.totaalUren)}</td>
        <td className="num">{fmtEUR(f.totaalBedrag)}</td>
        <td>{f.aangemaaktDoor}</td>
        <td className="actions">
          <button type="button" className="link-btn" onClick={onToggle} aria-expanded={open}>{open ? 'Verberg' : 'Details'}</button>
        </td>
      </tr>
      {open && (
        <tr className="child-row detail-row">
          <td colSpan={8}><Detail id={f.facturatieId} onTerugdraaien={onTerugdraaien} /></td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
export default function Facturatie() {
  const { search } = useLocation();
  const [tab, setTab] = useState<'open' | 'historie'>('open');
  return (
    <>
      <PageHead
        eyebrow="Facturatie"
        title="Uren factureren"
        sub="Selecteer uren, controleer het overzicht per project en functie, en markeer ze als gefactureerd."
      />
      <Content>
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'open', label: 'Te factureren' }, { id: 'historie', label: 'Gefactureerd (historie)' }]} />
        {tab === 'open' ? <TeFactureren startKlant={search.get('klantId') ?? ''} /> : <Historie />}
      </Content>
    </>
  );
}
