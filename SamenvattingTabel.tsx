import { fmtEUR, fmtUren, projectLabel } from '../lib/format';
import type { Samenvatting } from '../lib/types';

/** Overzicht per klant > project > functie: totaal uren, tarief en bedrag. */
export default function SamenvattingTabel({ s }: { s: Samenvatting }) {
  return (
    <div className="sum">
      {s.klanten.map((k) => (
        <div className="sum-klant" key={k.klantId}>
          <div className="sum-klant-head">
            <strong>{k.klantNaam}</strong>
            <span>{fmtUren(k.uren)} u · <strong>{fmtEUR(k.bedrag)}</strong></span>
          </div>
          {k.projecten.map((p) => (
            <div className="sum-project" key={p.projectId}>
              <div className="sum-project-head">
                <span>{projectLabel(p.projectCode, p.projectNaam)}</span>
                <span>{fmtUren(p.uren)} u · {fmtEUR(p.bedrag)}</span>
              </div>
              <ul className="sum-functies">
                {p.functies.map((f) => (
                  <li key={`${f.functieId}-${f.uurTarief}`}>
                    <span>{f.functieNaam}</span>
                    <span className="muted">{fmtUren(f.uren)} u × {fmtEUR(f.uurTarief)}</span>
                    <span className="amount">{fmtEUR(f.bedrag)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
      <div className="sum-total">
        <span>Totaal</span>
        <span>{fmtUren(s.totaalUren)} u</span>
        <strong>{fmtEUR(s.totaalBedrag)}</strong>
      </div>
    </div>
  );
}
