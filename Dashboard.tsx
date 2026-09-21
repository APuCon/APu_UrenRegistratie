import { useMemo, useState, type MouseEvent } from 'react';
import { api, qs } from '../lib/api';
import { fmtEUR, fmtEURCompact, fmtEURRond, fmtPct, fmtUren, maandNaam, projectLabel } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { Link } from '../lib/router';
import type { Dashboard as DashboardData, DashboardKlant, DashboardMaand, Kengetallen } from '../lib/types';
import { Content, Empty, ErrorBox, PageHead, Pill, Spinner } from '../components/ui';

/* ---------- hulpfuncties ---------- */
const totaal = (k: Kengetallen) => k.bedragGefactureerd + k.bedragOpen;
const graad = (k: Kengetallen) => (totaal(k) > 0 ? (k.bedragGefactureerd / totaal(k)) * 100 : 0);

/** Nette bovengrens voor een as met 4 intervallen. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nf = [1, 2, 4, 6, 8, 10].find((x) => f <= x) ?? 10;
  return nf * exp;
}

/** Vul ontbrekende maanden aan zodat de tijdas eerlijk is. Maximaal de laatste 24 maanden. */
function maandenReeks(perMaand: DashboardMaand[]): DashboardMaand[] {
  if (!perMaand.length) return [];
  const map = new Map(perMaand.map((m) => [m.maand, m]));
  const [y0, m0] = perMaand[0].maand.split('-').map(Number);
  const [y1, m1] = perMaand[perMaand.length - 1].maand.split('-').map(Number);
  const out: DashboardMaand[] = [];
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m++) {
    if (m > 12) { m = 1; y++; }
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(map.get(key) ?? { maand: key, urenGefactureerd: 0, urenOpen: 0, bedragGefactureerd: 0, bedragOpen: 0 });
    if (y === y1 && m === m1) break;
  }
  return out.slice(-24);
}

/* ---------- tooltip ---------- */
interface TipState { x: number; y: number; titel: string; regels: { kleur: string; label: string; waarde: string }[] }
function useTip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = (e: MouseEvent, titel: string, k: Kengetallen) =>
    setTip({
      x: e.clientX, y: e.clientY, titel,
      regels: [
        { kleur: 'var(--s1)', label: 'Gefactureerd', waarde: `${fmtEUR(k.bedragGefactureerd)} · ${fmtUren(k.urenGefactureerd)} u` },
        { kleur: 'var(--s2)', label: 'Nog te factureren', waarde: `${fmtEUR(k.bedragOpen)} · ${fmtUren(k.urenOpen)} u` },
      ],
    });
  return { tip, show, hide: () => setTip(null) };
}
function Tooltip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  const left = Math.min(tip.x + 14, window.innerWidth - 300);
  return (
    <div className="tooltip" style={{ left, top: tip.y + 14 }} role="tooltip">
      <div className="tooltip-title">{tip.titel}</div>
      {tip.regels.map((r) => (
        <div className="tooltip-row" key={r.label}>
          <span className="swatch" style={{ background: r.kleur }} aria-hidden="true" />
          <span>{r.label}</span>
          <strong>{r.waarde}</strong>
        </div>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="legend" aria-label="Legenda">
      <span><span className="swatch s1" aria-hidden="true" />Gefactureerd</span>
      <span><span className="swatch s2" aria-hidden="true" />Nog te factureren</span>
    </div>
  );
}

/* ---------- grafiek 1: per klant (horizontaal gestapeld) ---------- */
function KlantBalken({ klanten }: { klanten: DashboardKlant[] }) {
  const { tip, show, hide } = useTip();
  const rijen = [...klanten].filter((k) => totaal(k) > 0).sort((a, b) => totaal(b) - totaal(a));
  const max = Math.max(...rijen.map(totaal), 1);
  if (!rijen.length) return <Empty>Nog geen uren in deze periode.</Empty>;
  return (
    <div className="hbars" role="img" aria-label="Gefactureerd en nog te factureren bedrag per klant">
      {rijen.map((k) => (
        <div
          className="hbar-row"
          key={k.klantId}
          onMouseMove={(e) => show(e, k.klantNaam, k)}
          onMouseLeave={hide}
        >
          <div className="hbar-label" title={k.klantNaam}>{k.klantNaam}</div>
          <div className="hbar-track">
            <div className="hbar-stack" style={{ ['--w' as string]: totaal(k) / max }}>
              {k.bedragGefactureerd > 0 && <div className="seg s1" style={{ flex: k.bedragGefactureerd }} />}
              {k.bedragOpen > 0 && <div className="seg s2" style={{ flex: k.bedragOpen }} />}
            </div>
            <span className="hbar-value">{fmtEURRond(totaal(k))}</span>
          </div>
        </div>
      ))}
      <Tooltip tip={tip} />
    </div>
  );
}

/* ---------- grafiek 2: per maand (gestapelde kolommen) ---------- */
function MaandKolommen({ perMaand }: { perMaand: DashboardMaand[] }) {
  const { tip, show, hide } = useTip();
  const maanden = useMemo(() => maandenReeks(perMaand), [perMaand]);
  if (!maanden.length) return <Empty>Nog geen uren in deze periode.</Empty>;
  const top = niceMax(Math.max(...maanden.map(totaal)));
  const ticks = [0, 1, 2, 3, 4].map((i) => (top / 4) * i);
  const labelStap = maanden.length > 12 ? 2 : 1;
  return (
    <div className="cc" role="img" aria-label="Gefactureerd en nog te factureren bedrag per maand">
      <div className="cc-axis">
        {ticks.map((t, i) => (
          <span key={i} className="cc-tick" style={{ bottom: `${(t / top) * 100}%` }}>{fmtEURCompact(t)}</span>
        ))}
      </div>
      <div className="cc-main">
        <div className="cc-plot">
          {ticks.map((t, i) => (
            <div key={i} className="cc-grid" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="cc-cols">
            {maanden.map((m) => (
              <div
                className="cc-col"
                key={m.maand}
                onMouseMove={(e) => show(e, `${maandNaam(m.maand)} ${m.maand.slice(0, 4)}`, m)}
                onMouseLeave={hide}
              >
                <div className="cc-stack" style={{ height: `${(totaal(m) / top) * 100}%` }}>
                  {m.bedragOpen > 0 && <div className="seg s2" style={{ flex: m.bedragOpen }} />}
                  {m.bedragGefactureerd > 0 && <div className="seg s1" style={{ flex: m.bedragGefactureerd }} />}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="cc-x">
          {maanden.map((m, i) => (
            <span key={m.maand}>
              {i % labelStap === 0 && maandNaam(m.maand)}
              {i % labelStap === 0 && (i === 0 || m.maand.endsWith('-01')) && <em>{m.maand.slice(0, 4)}</em>}
            </span>
          ))}
        </div>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/* ---------- tabel per klant en project ---------- */
function KlantTabel({ klanten, totalen }: { klanten: DashboardKlant[]; totalen: Kengetallen }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const alleOpen = klanten.length > 0 && open.size === klanten.length;
  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  if (!klanten.length) return <Empty>Nog geen uren in deze periode.</Empty>;
  return (
    <>
      <div className="table-tools">
        <button type="button" className="btn small" onClick={() => setOpen(alleOpen ? new Set() : new Set(klanten.map((k) => k.klantId)))}>
          {alleOpen ? 'Alles inklappen' : 'Alles uitklappen'}
        </button>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th rowSpan={2}>Klant / project</th>
              <th colSpan={2} className="grp">Gefactureerd</th>
              <th colSpan={2} className="grp">Nog te factureren</th>
              <th rowSpan={2} className="num">Totaal</th>
              <th rowSpan={2} className="num">% gefact.</th>
              <th rowSpan={2} />
            </tr>
            <tr className="sub-head">
              <th className="num">Uren</th>
              <th className="num">Bedrag</th>
              <th className="num">Uren</th>
              <th className="num">Bedrag</th>
            </tr>
          </thead>
          <tbody>
            {klanten.map((k) => {
              const isOpen = open.has(k.klantId);
              return (
                <KlantRijen key={k.klantId} k={k} isOpen={isOpen} onToggle={() => toggle(k.klantId)} />
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Totaal</td>
              <td className="num">{fmtUren(totalen.urenGefactureerd)}</td>
              <td className="num">{fmtEUR(totalen.bedragGefactureerd)}</td>
              <td className="num">{fmtUren(totalen.urenOpen)}</td>
              <td className="num">{fmtEUR(totalen.bedragOpen)}</td>
              <td className="num">{fmtEUR(totaal(totalen))}</td>
              <td className="num">{fmtPct(graad(totalen))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function KlantRijen({ k, isOpen, onToggle }: { k: DashboardKlant; isOpen: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="group-row">
        <td>
          <button type="button" className="expander" onClick={onToggle} aria-expanded={isOpen} aria-label={`${k.klantNaam} ${isOpen ? 'inklappen' : 'uitklappen'}`}>
            <span className={`chev${isOpen ? ' open' : ''}`} aria-hidden="true">▸</span>
            <strong>{k.klantNaam}</strong>
            <span className="muted"> · {k.projecten.length} {k.projecten.length === 1 ? 'project' : 'projecten'}</span>
          </button>
        </td>
        <td className="num">{fmtUren(k.urenGefactureerd)}</td>
        <td className="num">{fmtEUR(k.bedragGefactureerd)}</td>
        <td className="num">{fmtUren(k.urenOpen)}</td>
        <td className="num strong">{fmtEUR(k.bedragOpen)}</td>
        <td className="num">{fmtEUR(totaal(k))}</td>
        <td className="num">{fmtPct(graad(k))}</td>
        <td className="num">
          {k.bedragOpen > 0 && <Link to={`/facturatie?klantId=${k.klantId}`} className="link">Factureren →</Link>}
        </td>
      </tr>
      {isOpen &&
        k.projecten.map((p) => (
          <tr key={p.projectId} className="child-row">
            <td className="indent">
              {projectLabel(p.projectCode, p.projectNaam)}
              {p.projectStatus !== 'Actief' && <span className="muted"> ({p.projectStatus.toLowerCase()})</span>}
            </td>
            <td className="num">{fmtUren(p.urenGefactureerd)}</td>
            <td className="num">{fmtEUR(p.bedragGefactureerd)}</td>
            <td className="num">{fmtUren(p.urenOpen)}</td>
            <td className="num">{fmtEUR(p.bedragOpen)}</td>
            <td className="num">{fmtEUR(totaal(p))}</td>
            <td className="num">{fmtPct(graad(p))}</td>
            <td />
          </tr>
        ))}
    </>
  );
}

/* ---------- pagina ---------- */
export default function Dashboard() {
  const huidigJaar = new Date().getFullYear();
  const [periode, setPeriode] = useState<string>(String(huidigJaar));
  const van = periode === 'alle' ? null : `${periode}-01-01`;
  const tot = periode === 'alle' ? null : `${periode}-12-31`;
  const d = useAsync(() => api.get<DashboardData>(`/dashboard${qs({ van, tot })}`), [periode]);

  const jaren = useMemo(() => {
    const set = new Set<number>([huidigJaar, ...(d.data?.jaren ?? [])]);
    return [...set].sort((a, b) => b - a);
  }, [d.data, huidigJaar]);

  const t = d.data?.totalen;
  return (
    <>
      <PageHead eyebrow="Overzicht" title="Dashboard" sub="Wat is er gefactureerd en wat staat er nog open, per klant en project.">
        <label className="inline-field on-dark">
          <span>Periode (datum van de uren)</span>
          <select value={periode} onChange={(e) => setPeriode(e.target.value)}>
            {jaren.map((j) => <option key={j} value={j}>{j}</option>)}
            <option value="alle">Alle jaren</option>
          </select>
        </label>
      </PageHead>
      <Content>
      {d.error && <ErrorBox message={d.error} onRetry={d.reload} />}
      {d.loading && !d.data && <Spinner />}

      {t && d.data && (
        <>
          <section className="kpis">
            <div className="kpi hero">
              <div className="kpi-label">Nog te factureren</div>
              <div className="kpi-hero-value">{fmtEUR(t.bedragOpen)}</div>
              <div className="kpi-sub">
                {fmtUren(t.urenOpen)} uur ·{' '}
                {t.bedragOpen > 0 ? <Link to="/facturatie" className="link">naar facturatie →</Link> : 'alles is gefactureerd'}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Gefactureerd</div>
              <div className="kpi-value">{fmtEUR(t.bedragGefactureerd)}</div>
              <div className="kpi-sub">{fmtUren(t.urenGefactureerd)} uur</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Totaal geregistreerd</div>
              <div className="kpi-value">{fmtEUR(totaal(t))}</div>
              <div className="kpi-sub">{fmtUren(t.urenGefactureerd + t.urenOpen)} uur</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Facturatiegraad</div>
              <div className="kpi-value">{fmtPct(graad(t))}</div>
              <div className="kpi-sub">van het bedrag is gefactureerd</div>
            </div>
          </section>

          <section className="grid-2">
            <div className="card">
              <div className="card-head">
                <h2>Per klant</h2>
                <Legend />
              </div>
              <KlantBalken klanten={d.data.klanten} />
            </div>
            <div className="card">
              <div className="card-head">
                <h2>Per maand</h2>
                <Legend />
              </div>
              <MaandKolommen perMaand={d.data.perMaand} />
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Klanten en projecten</h2>
              <Pill tone="neutraal">{d.data.klanten.length} {d.data.klanten.length === 1 ? 'klant' : 'klanten'}</Pill>
            </div>
            <KlantTabel klanten={d.data.klanten} totalen={t} />
          </section>
        </>
      )}
      </Content>
    </>
  );
}
