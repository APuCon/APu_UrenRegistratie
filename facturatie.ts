import { query, transaction } from '../lib/db';
import { endpoint, HttpError } from '../lib/http';
import { maakSamenvatting, UurRegel } from '../lib/samenvatting';
import { idParam, optDate, optString, qDate, qInt } from '../lib/validate';

const MAX_UREN_PER_FACTURATIE = 5000;

const LIJN_SELECT = `
  SELECT u.UurId AS uurId, u.FacturatieId AS facturatieId, CONVERT(char(10), u.Datum, 23) AS datum,
         k.KlantId AS klantId, k.Naam AS klantNaam,
         p.ProjectId AS projectId, p.Code AS projectCode, p.Naam AS projectNaam,
         f.FunctieId AS functieId, f.Naam AS functieNaam,
         m.Naam AS medewerkerNaam, u.Omschrijving AS omschrijving,
         u.Aantal AS aantal, u.UurTarief AS uurTarief, u.Bedrag AS bedrag
  FROM dbo.Uur u
  JOIN dbo.Project p ON p.ProjectId = u.ProjectId
  JOIN dbo.Klant k ON k.KlantId = p.KlantId
  JOIN dbo.Functie f ON f.FunctieId = u.FunctieId
  JOIN dbo.Medewerker m ON m.MedewerkerId = u.MedewerkerId`;

interface Lijn extends UurRegel {
  uurId: number;
  facturatieId: number | null;
  datum: string;
  medewerkerNaam: string;
  omschrijving: string | null;
}

const HEADER_SELECT = `
  SELECT fa.FacturatieId AS facturatieId, fa.KlantId AS klantId, k.Naam AS klantNaam, fa.Referentie AS referentie,
         CONVERT(char(10), fa.FactuurDatum, 23) AS factuurDatum, fa.Opmerking AS opmerking,
         fa.TotaalUren AS totaalUren, fa.TotaalBedrag AS totaalBedrag,
         fa.AangemaaktDoor AS aangemaaktDoor, fa.AangemaaktOp AS aangemaaktOp,
         (SELECT COUNT(*) FROM dbo.Uur u WHERE u.FacturatieId = fa.FacturatieId) AS aantalRegels
  FROM dbo.Facturatie fa JOIN dbo.Klant k ON k.KlantId = fa.KlantId`;

/* ------------------------------------------------------------------ *
 *  Uren op 'gefactureerd' zetten
 * ------------------------------------------------------------------ */
endpoint('facturatie-uitvoeren', 'POST', 'facturaties', 'admin', async ({ body, user }) => {
  const ruw = body.uurIds;
  if (!Array.isArray(ruw) || ruw.length === 0) throw new HttpError(400, 'Selecteer minimaal één uur.');
  if (ruw.length > MAX_UREN_PER_FACTURATIE) {
    throw new HttpError(400, `Selecteer maximaal ${MAX_UREN_PER_FACTURATIE} uren tegelijk.`);
  }
  const ids = [...new Set(ruw.map((x) => Number(x)))];
  if (ids.some((n) => !Number.isSafeInteger(n) || n <= 0)) throw new HttpError(400, 'Ongeldige selectie.');

  const referentie = optString(body, 'referentie', 'Referentie', 100);
  const opmerking = optString(body, 'opmerking', 'Opmerking', 500);
  const factuurDatum = optDate(body, 'factuurDatum', 'Factuurdatum') ?? new Date().toISOString().slice(0, 10);

  return transaction(async (q) => {
    // Rijen vergrendelen zodat dezelfde uren niet tegelijk door twee sessies gefactureerd worden.
    const regels = await q<Lijn>(
      `${LIJN_SELECT.replace('FROM dbo.Uur u', 'FROM dbo.Uur u WITH (UPDLOCK, HOLDLOCK)')}
       WHERE u.UurId IN (SELECT CAST([value] AS BIGINT) FROM OPENJSON(@ids))`,
      { ids: JSON.stringify(ids) },
    );
    if (regels.length !== ids.length) {
      throw new HttpError(409, 'Een of meer geselecteerde uren bestaan niet meer. Ververs de pagina en probeer opnieuw.');
    }
    if (regels.some((r) => r.facturatieId !== null)) {
      throw new HttpError(409, 'Een of meer geselecteerde uren zijn inmiddels al gefactureerd. Ververs de pagina en probeer opnieuw.');
    }

    const perKlant = new Map<number, Lijn[]>();
    for (const r of regels) perKlant.set(r.klantId, [...(perKlant.get(r.klantId) ?? []), r]);

    const aangemaakt: number[] = [];
    for (const [klantId, klantRegels] of perKlant) {
      const s = maakSamenvatting(klantRegels);
      const rows = await q<{ id: number }>(
        `INSERT INTO dbo.Facturatie (KlantId, Referentie, FactuurDatum, Opmerking, TotaalUren, TotaalBedrag, AangemaaktDoor)
         OUTPUT INSERTED.FacturatieId AS id
         VALUES (@klantId, @referentie, CAST(@factuurDatum AS DATE), @opmerking, @totaalUren, @totaalBedrag, @door)`,
        {
          klantId, referentie, factuurDatum, opmerking,
          totaalUren: s.totaalUren, totaalBedrag: s.totaalBedrag, door: user.email,
        },
      );
      const facturatieId = rows[0].id;
      const upd = await q<{ n: number }>(
        `UPDATE dbo.Uur SET FacturatieId = @facturatieId, GewijzigdOp = SYSUTCDATETIME()
         WHERE FacturatieId IS NULL AND UurId IN (SELECT CAST([value] AS BIGINT) FROM OPENJSON(@ids));
         SELECT @@ROWCOUNT AS n;`,
        { facturatieId, ids: JSON.stringify(klantRegels.map((r) => r.uurId)) },
      );
      if (upd[0].n !== klantRegels.length) throw new HttpError(409, 'De selectie is intussen gewijzigd. Probeer opnieuw.');
      aangemaakt.push(facturatieId);
    }

    const facturaties = await q(`${HEADER_SELECT} WHERE fa.FacturatieId IN (SELECT CAST([value] AS INT) FROM OPENJSON(@fids))
                                 ORDER BY k.Naam`, { fids: JSON.stringify(aangemaakt) });
    return { facturaties, samenvatting: maakSamenvatting(regels) };
  });
});

/* ------------------------------------------------------------------ *
 *  Historie
 * ------------------------------------------------------------------ */
endpoint('facturaties-lijst', 'GET', 'facturaties', 'admin', async ({ query: q }) => {
  return query(
    `${HEADER_SELECT}
     WHERE (@klantId IS NULL OR fa.KlantId = @klantId)
       AND (@van IS NULL OR fa.FactuurDatum >= CAST(@van AS DATE))
       AND (@tot IS NULL OR fa.FactuurDatum <= CAST(@tot AS DATE))
     ORDER BY fa.FactuurDatum DESC, fa.FacturatieId DESC`,
    { klantId: qInt(q, 'klantId'), van: qDate(q, 'van'), tot: qDate(q, 'tot') },
  );
});

endpoint('facturaties-detail', 'GET', 'facturaties/{id}', 'admin', async ({ params }) => {
  const id = idParam(params);
  const header = (await query(`${HEADER_SELECT} WHERE fa.FacturatieId = @id`, { id }))[0];
  if (!header) throw new HttpError(404, 'Facturatie niet gevonden.');
  const regels = await query<Lijn>(`${LIJN_SELECT} WHERE u.FacturatieId = @id ORDER BY u.Datum, u.UurId`, { id });
  return { ...header, regels, samenvatting: maakSamenvatting(regels) };
});

/** Fout gemaakt? Zet alle uren van deze facturatie terug op 'niet gefactureerd'. */
endpoint('facturaties-terugdraaien', 'POST', 'facturaties/{id}/terugdraaien', 'admin', async ({ params }) => {
  const id = idParam(params);
  return transaction(async (q) => {
    const bestaat = await q(`SELECT 1 AS x FROM dbo.Facturatie WITH (UPDLOCK) WHERE FacturatieId = @id`, { id });
    if (!bestaat.length) throw new HttpError(404, 'Facturatie niet gevonden.');
    const r = await q<{ n: number }>(
      `UPDATE dbo.Uur SET FacturatieId = NULL, GewijzigdOp = SYSUTCDATETIME() WHERE FacturatieId = @id;
       SELECT @@ROWCOUNT AS n;`,
      { id },
    );
    await q(`DELETE FROM dbo.Facturatie WHERE FacturatieId = @id`, { id });
    return { teruggedraaideUren: r[0].n };
  });
});
