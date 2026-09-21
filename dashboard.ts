import { query } from '../lib/db';
import { endpoint } from '../lib/http';
import { qDate } from '../lib/validate';

interface Rij {
  klantId: number;
  klantNaam: string;
  projectId: number;
  projectCode: string | null;
  projectNaam: string;
  projectStatus: string;
  urenGefactureerd: number;
  urenOpen: number;
  bedragGefactureerd: number;
  bedragOpen: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Dashboard: per klant en project wat gefactureerd is en wat nog niet. Optioneel gefilterd op periode (urendatum). */
endpoint('dashboard', 'GET', 'dashboard', 'admin', async ({ query: q }) => {
  const van = qDate(q, 'van');
  const tot = qDate(q, 'tot');
  const params = { van, tot };
  const periode = `(@van IS NULL OR u.Datum >= CAST(@van AS DATE)) AND (@tot IS NULL OR u.Datum <= CAST(@tot AS DATE))`;

  const rijen = await query<Rij>(
    `SELECT k.KlantId AS klantId, k.Naam AS klantNaam, p.ProjectId AS projectId, p.Code AS projectCode,
            p.Naam AS projectNaam, p.Status AS projectStatus,
            CAST(SUM(CASE WHEN u.FacturatieId IS NOT NULL THEN u.Aantal ELSE 0 END) AS DECIMAL(14,2)) AS urenGefactureerd,
            CAST(SUM(CASE WHEN u.FacturatieId IS NULL     THEN u.Aantal ELSE 0 END) AS DECIMAL(14,2)) AS urenOpen,
            CAST(SUM(CASE WHEN u.FacturatieId IS NOT NULL THEN u.Bedrag ELSE 0 END) AS DECIMAL(14,2)) AS bedragGefactureerd,
            CAST(SUM(CASE WHEN u.FacturatieId IS NULL     THEN u.Bedrag ELSE 0 END) AS DECIMAL(14,2)) AS bedragOpen
     FROM dbo.Uur u
     JOIN dbo.Project p ON p.ProjectId = u.ProjectId
     JOIN dbo.Klant k ON k.KlantId = p.KlantId
     WHERE ${periode}
     GROUP BY k.KlantId, k.Naam, p.ProjectId, p.Code, p.Naam, p.Status
     ORDER BY k.Naam, p.Naam`,
    params,
  );

  const perMaand = await query<{
    maand: string; urenGefactureerd: number; urenOpen: number; bedragGefactureerd: number; bedragOpen: number;
  }>(
    `SELECT CONVERT(char(7), u.Datum, 126) AS maand,
            CAST(SUM(CASE WHEN u.FacturatieId IS NOT NULL THEN u.Aantal ELSE 0 END) AS DECIMAL(14,2)) AS urenGefactureerd,
            CAST(SUM(CASE WHEN u.FacturatieId IS NULL     THEN u.Aantal ELSE 0 END) AS DECIMAL(14,2)) AS urenOpen,
            CAST(SUM(CASE WHEN u.FacturatieId IS NOT NULL THEN u.Bedrag ELSE 0 END) AS DECIMAL(14,2)) AS bedragGefactureerd,
            CAST(SUM(CASE WHEN u.FacturatieId IS NULL     THEN u.Bedrag ELSE 0 END) AS DECIMAL(14,2)) AS bedragOpen
     FROM dbo.Uur u
     WHERE ${periode}
     GROUP BY CONVERT(char(7), u.Datum, 126)
     ORDER BY CONVERT(char(7), u.Datum, 126)`,
    params,
  );

  const jaren = await query<{ jaar: number }>(
    `SELECT DISTINCT YEAR(Datum) AS jaar FROM dbo.Uur ORDER BY jaar DESC`,
  );

  const klanten: Array<Record<string, unknown> & { projecten: Rij[] }> = [];
  const totalen = { urenGefactureerd: 0, urenOpen: 0, bedragGefactureerd: 0, bedragOpen: 0 };
  for (const r of rijen) {
    let klant = klanten.find((k) => k.klantId === r.klantId);
    if (!klant) {
      klant = {
        klantId: r.klantId, klantNaam: r.klantNaam,
        urenGefactureerd: 0, urenOpen: 0, bedragGefactureerd: 0, bedragOpen: 0,
        projecten: [],
      };
      klanten.push(klant);
    }
    klant.projecten.push(r);
    for (const key of ['urenGefactureerd', 'urenOpen', 'bedragGefactureerd', 'bedragOpen'] as const) {
      klant[key] = r2((klant[key] as number) + r[key]);
      totalen[key] = r2(totalen[key] + r[key]);
    }
  }
  return { totalen, klanten, perMaand, jaren: jaren.map((j) => j.jaar) };
});
