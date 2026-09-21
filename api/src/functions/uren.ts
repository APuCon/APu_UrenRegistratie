import { query, QueryFn } from '../lib/db';
import { endpoint, HttpError } from '../lib/http';
import { idParam, optInt, optString, qDate, qInt, reqDate, reqDecimal, reqInt } from '../lib/validate';

const MAX_RIJEN = 5000;

/* ------------------------------------------------------------------ *
 *  Keuzelijsten voor het invoerformulier
 * ------------------------------------------------------------------ */
endpoint('uren-opties', 'GET', 'uren/opties', 'user', async ({ user }) => {
  const projecten = await query<{ projectId: number; code: string | null; naam: string; klantId: number; klantNaam: string }>(
    `SELECT p.ProjectId AS projectId, p.Code AS code, p.Naam AS naam, k.KlantId AS klantId, k.Naam AS klantNaam
     FROM dbo.Project p JOIN dbo.Klant k ON k.KlantId = p.KlantId
     WHERE p.Status = N'Actief' AND k.Actief = 1
     ORDER BY k.Naam, p.Naam`,
  );
  // Alleen functies waarvoor voor de klant een tarief is ingesteld (medewerkers zien het bedrag zelf niet).
  const functies = await query<{ klantId: number; functieId: number; naam: string }>(
    `SELECT DISTINCT t.KlantId AS klantId, f.FunctieId AS functieId, f.Naam AS naam
     FROM dbo.Tarief t JOIN dbo.Functie f ON f.FunctieId = t.FunctieId
     WHERE f.Actief = 1
     ORDER BY naam`,
  );
  const result: Record<string, unknown> = {
    standaardFunctieId: user.standaardFunctieId,
    projecten: projecten.map((p) => ({
      ...p,
      functies: functies.filter((f) => f.klantId === p.klantId).map((f) => ({ functieId: f.functieId, naam: f.naam })),
    })),
  };
  if (user.rol === 'Admin') {
    result.medewerkers = await query(
      `SELECT MedewerkerId AS medewerkerId, Naam AS naam FROM dbo.Medewerker WHERE Actief = 1 ORDER BY Naam`,
    );
  }
  return result;
});

/* ------------------------------------------------------------------ *
 *  Uren opvragen
 * ------------------------------------------------------------------ */
interface UurRij {
  uurId: number;
  datum: string;
  medewerkerId: number;
  medewerkerNaam: string;
  klantId: number;
  klantNaam: string;
  projectId: number;
  projectCode: string | null;
  projectNaam: string;
  functieId: number;
  functieNaam: string;
  aantal: number;
  uurTarief: number | null;
  bedrag: number | null;
  omschrijving: string | null;
  facturatieId: number | null;
  factuurReferentie: string | null;
  factuurDatum: string | null;
}

endpoint('uren-lijst', 'GET', 'uren', 'user', async ({ query: q, user }) => {
  const isAdmin = user.rol === 'Admin';
  const status = q.get('status') ?? 'alle';
  if (!['alle', 'open', 'gefactureerd'].includes(status)) throw new HttpError(400, 'Ongeldige status.');
  // Medewerkers zien uitsluitend hun eigen uren, ongeacht wat ze meesturen.
  const medewerkerId = isAdmin ? qInt(q, 'medewerkerId') : user.medewerkerId;

  const rows = await query<UurRij>(
    `SELECT TOP (${MAX_RIJEN + 1})
            u.UurId AS uurId, CONVERT(char(10), u.Datum, 23) AS datum,
            m.MedewerkerId AS medewerkerId, m.Naam AS medewerkerNaam,
            k.KlantId AS klantId, k.Naam AS klantNaam,
            p.ProjectId AS projectId, p.Code AS projectCode, p.Naam AS projectNaam,
            f.FunctieId AS functieId, f.Naam AS functieNaam,
            u.Aantal AS aantal, u.UurTarief AS uurTarief, u.Bedrag AS bedrag,
            u.Omschrijving AS omschrijving, u.FacturatieId AS facturatieId,
            fa.Referentie AS factuurReferentie, CONVERT(char(10), fa.FactuurDatum, 23) AS factuurDatum
     FROM dbo.Uur u
     JOIN dbo.Medewerker m ON m.MedewerkerId = u.MedewerkerId
     JOIN dbo.Project p    ON p.ProjectId    = u.ProjectId
     JOIN dbo.Klant k      ON k.KlantId      = p.KlantId
     JOIN dbo.Functie f    ON f.FunctieId    = u.FunctieId
     LEFT JOIN dbo.Facturatie fa ON fa.FacturatieId = u.FacturatieId
     WHERE (@van IS NULL OR u.Datum >= CAST(@van AS DATE))
       AND (@tot IS NULL OR u.Datum <= CAST(@tot AS DATE))
       AND (@klantId IS NULL OR k.KlantId = @klantId)
       AND (@projectId IS NULL OR p.ProjectId = @projectId)
       AND (@medewerkerId IS NULL OR u.MedewerkerId = @medewerkerId)
       AND (@status = N'alle'
            OR (@status = N'open' AND u.FacturatieId IS NULL)
            OR (@status = N'gefactureerd' AND u.FacturatieId IS NOT NULL))
     ORDER BY u.Datum DESC, u.UurId DESC`,
    {
      van: qDate(q, 'van'),
      tot: qDate(q, 'tot'),
      klantId: qInt(q, 'klantId'),
      projectId: qInt(q, 'projectId'),
      medewerkerId,
      status,
    },
  );
  const afgekapt = rows.length > MAX_RIJEN;
  const uren = rows.slice(0, MAX_RIJEN).map((r) =>
    isAdmin ? r : { ...r, uurTarief: null, bedrag: null, factuurReferentie: null },
  );
  return { uren, afgekapt };
});

/* ------------------------------------------------------------------ *
 *  Tarief bepalen en uur opslaan
 * ------------------------------------------------------------------ */
async function bepaalTarief(q: QueryFn, projectId: number, functieId: number, datum: string) {
  const project = (
    await q<{ klantId: number; status: string; klantActief: boolean }>(
      `SELECT p.KlantId AS klantId, p.Status AS status, k.Actief AS klantActief
       FROM dbo.Project p JOIN dbo.Klant k ON k.KlantId = p.KlantId WHERE p.ProjectId = @projectId`,
      { projectId },
    )
  )[0];
  if (!project) throw new HttpError(400, 'Project bestaat niet.');
  if (project.status !== 'Actief' || !project.klantActief) {
    throw new HttpError(422, 'Op dit project kunnen geen uren worden geschreven (project of klant is niet actief).');
  }
  const functie = (await q<{ actief: boolean }>(`SELECT Actief AS actief FROM dbo.Functie WHERE FunctieId = @functieId`, { functieId }))[0];
  if (!functie || !functie.actief) throw new HttpError(400, 'Functie bestaat niet of is niet actief.');

  const tarief = (
    await q<{ tariefId: number; uurTarief: number }>(
      `SELECT TOP 1 TariefId AS tariefId, UurTarief AS uurTarief
       FROM dbo.Tarief
       WHERE KlantId = @klantId AND FunctieId = @functieId AND GeldigVanaf <= CAST(@datum AS DATE)
       ORDER BY GeldigVanaf DESC`,
      { klantId: project.klantId, functieId, datum },
    )
  )[0];
  if (!tarief) {
    throw new HttpError(422, 'Voor deze klant en functie is op deze datum geen tarief ingesteld. Vraag de beheerder een tarief toe te voegen.');
  }
  return tarief;
}

function uurVelden(body: Record<string, unknown>) {
  return {
    datum: reqDate(body, 'datum', 'Datum'),
    projectId: reqInt(body, 'projectId', 'Project'),
    functieId: reqInt(body, 'functieId', 'Functie'),
    aantal: reqDecimal(body, 'aantal', 'Aantal uren', 0.01, 24),
    omschrijving: optString(body, 'omschrijving', 'Omschrijving', 500),
  };
}

const UUR_SELECT = `
  SELECT u.UurId AS uurId, CONVERT(char(10), u.Datum, 23) AS datum, m.MedewerkerId AS medewerkerId, m.Naam AS medewerkerNaam,
         k.KlantId AS klantId, k.Naam AS klantNaam, p.ProjectId AS projectId, p.Code AS projectCode, p.Naam AS projectNaam,
         f.FunctieId AS functieId, f.Naam AS functieNaam, u.Aantal AS aantal, u.UurTarief AS uurTarief, u.Bedrag AS bedrag,
         u.Omschrijving AS omschrijving, u.FacturatieId AS facturatieId
  FROM dbo.Uur u
  JOIN dbo.Medewerker m ON m.MedewerkerId = u.MedewerkerId
  JOIN dbo.Project p ON p.ProjectId = u.ProjectId
  JOIN dbo.Klant k ON k.KlantId = p.KlantId
  JOIN dbo.Functie f ON f.FunctieId = u.FunctieId
  WHERE u.UurId = @id`;

async function teruggeven(id: number, isAdmin: boolean) {
  const r = (await query<UurRij>(UUR_SELECT, { id }))[0];
  return isAdmin ? r : { ...r, uurTarief: null, bedrag: null };
}

endpoint('uren-nieuw', 'POST', 'uren', 'user', async ({ body, user }) => {
  const isAdmin = user.rol === 'Admin';
  const v = uurVelden(body);
  let medewerkerId = user.medewerkerId;
  if (isAdmin) {
    const gekozen = optInt(body, 'medewerkerId', 'Medewerker');
    if (gekozen) {
      const m = await query(`SELECT 1 AS x FROM dbo.Medewerker WHERE MedewerkerId = @gekozen AND Actief = 1`, { gekozen });
      if (!m.length) throw new HttpError(400, 'Medewerker bestaat niet of is niet actief.');
      medewerkerId = gekozen;
    }
  }
  const tarief = await bepaalTarief(query, v.projectId, v.functieId, v.datum);
  const rows = await query<{ id: number }>(
    `INSERT INTO dbo.Uur (MedewerkerId, ProjectId, FunctieId, TariefId, Datum, Aantal, UurTarief, Omschrijving)
     OUTPUT INSERTED.UurId AS id
     VALUES (@medewerkerId, @projectId, @functieId, @tariefId, CAST(@datum AS DATE), @aantal, @uurTarief, @omschrijving)`,
    { ...v, medewerkerId, tariefId: tarief.tariefId, uurTarief: tarief.uurTarief },
  );
  return teruggeven(rows[0].id, isAdmin);
});

/** Haal een uur op en controleer of de gebruiker het mag wijzigen. */
async function laadWijzigbaarUur(id: number, user: { medewerkerId: number; rol: string }) {
  const rij = (
    await query<{
      medewerkerId: number; projectId: number; functieId: number; datum: string;
      tariefId: number; uurTarief: number; facturatieId: number | null;
    }>(
      `SELECT MedewerkerId AS medewerkerId, ProjectId AS projectId, FunctieId AS functieId,
              CONVERT(char(10), Datum, 23) AS datum, TariefId AS tariefId, UurTarief AS uurTarief, FacturatieId AS facturatieId
       FROM dbo.Uur WHERE UurId = @id`,
      { id },
    )
  )[0];
  if (!rij) throw new HttpError(404, 'Uur niet gevonden.');
  if (user.rol !== 'Admin' && rij.medewerkerId !== user.medewerkerId) {
    throw new HttpError(403, 'Je kunt alleen je eigen uren wijzigen.');
  }
  if (rij.facturatieId !== null) {
    throw new HttpError(409, 'Deze uren zijn al gefactureerd en kunnen niet meer worden gewijzigd. Draai eerst de facturatie terug.');
  }
  return rij;
}

endpoint('uren-wijzig', 'PUT', 'uren/{id}', 'user', async ({ params, body, user }) => {
  const id = idParam(params);
  const isAdmin = user.rol === 'Admin';
  const v = uurVelden(body);
  const huidig = await laadWijzigbaarUur(id, user);

  let medewerkerId = huidig.medewerkerId;
  if (isAdmin) {
    const gekozen = optInt(body, 'medewerkerId', 'Medewerker');
    if (gekozen) medewerkerId = gekozen;
  }

  let { tariefId, uurTarief } = huidig;
  const gewijzigd = huidig.projectId !== v.projectId || huidig.functieId !== v.functieId || huidig.datum !== v.datum;
  if (gewijzigd) {
    const t = await bepaalTarief(query, v.projectId, v.functieId, v.datum);
    tariefId = t.tariefId;
    uurTarief = t.uurTarief;
  }
  const r = await query(
    `UPDATE dbo.Uur SET MedewerkerId=@medewerkerId, ProjectId=@projectId, FunctieId=@functieId, TariefId=@tariefId,
            Datum=CAST(@datum AS DATE), Aantal=@aantal, UurTarief=@uurTarief, Omschrijving=@omschrijving,
            GewijzigdOp=SYSUTCDATETIME()
     WHERE UurId=@id AND FacturatieId IS NULL;
     SELECT @@ROWCOUNT AS n;`,
    { ...v, id, medewerkerId, tariefId, uurTarief },
  );
  if (!(r[0] as { n: number }).n) throw new HttpError(409, 'Deze uren zijn inmiddels gefactureerd en kunnen niet meer worden gewijzigd.');
  return teruggeven(id, isAdmin);
});

endpoint('uren-verwijder', 'DELETE', 'uren/{id}', 'user', async ({ params, user }) => {
  const id = idParam(params);
  await laadWijzigbaarUur(id, user);
  const r = await query<{ n: number }>(
    `DELETE FROM dbo.Uur WHERE UurId = @id AND FacturatieId IS NULL; SELECT @@ROWCOUNT AS n;`,
    { id },
  );
  if (!r[0].n) throw new HttpError(409, 'Deze uren zijn inmiddels gefactureerd en kunnen niet meer worden verwijderd.');
  return undefined;
});
