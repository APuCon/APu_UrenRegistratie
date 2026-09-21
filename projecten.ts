import { query } from '../lib/db';
import { endpoint, HttpError } from '../lib/http';
import { idParam, oneOf, optDate, optString, qInt, reqInt, reqString } from '../lib/validate';

const STATUSSEN = ['Actief', 'Afgerond', 'Gearchiveerd'] as const;

const SELECT = `
  SELECT p.ProjectId AS projectId, p.KlantId AS klantId, k.Naam AS klantNaam, p.Code AS code, p.Naam AS naam,
         p.Omschrijving AS omschrijving, p.Status AS status,
         CONVERT(char(10), p.StartDatum, 23) AS startDatum, CONVERT(char(10), p.EindDatum, 23) AS eindDatum,
         (SELECT COUNT(*) FROM dbo.Uur u WHERE u.ProjectId = p.ProjectId) AS aantalUren
  FROM dbo.Project p
  JOIN dbo.Klant k ON k.KlantId = p.KlantId`;

function velden(body: Record<string, unknown>) {
  const startDatum = optDate(body, 'startDatum', 'Startdatum');
  const eindDatum = optDate(body, 'eindDatum', 'Einddatum');
  if (startDatum && eindDatum && eindDatum < startDatum) {
    throw new HttpError(400, 'De einddatum ligt voor de startdatum.');
  }
  return {
    klantId: reqInt(body, 'klantId', 'Klant'),
    code: optString(body, 'code', 'Projectcode', 30),
    naam: reqString(body, 'naam', 'Naam', 200),
    omschrijving: optString(body, 'omschrijving', 'Omschrijving', 1000),
    status: oneOf(body, 'status', 'Status', STATUSSEN, 'Actief'),
    startDatum,
    eindDatum,
  };
}

endpoint('projecten-lijst', 'GET', 'projecten', 'admin', async ({ query: q }) => {
  const klantId = qInt(q, 'klantId');
  const status = q.get('status');
  if (status && !STATUSSEN.includes(status as (typeof STATUSSEN)[number])) {
    throw new HttpError(400, 'Ongeldige status.');
  }
  return query(
    `${SELECT}
     WHERE (@klantId IS NULL OR p.KlantId = @klantId) AND (@status IS NULL OR p.Status = @status)
     ORDER BY CASE p.Status WHEN N'Actief' THEN 0 WHEN N'Afgerond' THEN 1 ELSE 2 END, k.Naam, p.Naam`,
    { klantId, status: status || null },
  );
});

endpoint('projecten-nieuw', 'POST', 'projecten', 'admin', async ({ body }) => {
  const v = velden(body);
  const klant = await query(`SELECT 1 AS x FROM dbo.Klant WHERE KlantId = @klantId`, { klantId: v.klantId });
  if (!klant.length) throw new HttpError(400, 'Klant bestaat niet.');
  const rows = await query<{ id: number }>(
    `INSERT INTO dbo.Project (KlantId, Code, Naam, Omschrijving, Status, StartDatum, EindDatum)
     OUTPUT INSERTED.ProjectId AS id
     VALUES (@klantId, @code, @naam, @omschrijving, @status, CAST(@startDatum AS DATE), CAST(@eindDatum AS DATE))`,
    v,
  );
  return (await query(`${SELECT} WHERE p.ProjectId = @id`, { id: rows[0].id }))[0];
});

endpoint('projecten-wijzig', 'PUT', 'projecten/{id}', 'admin', async ({ params, body }) => {
  const id = idParam(params);
  const v = velden(body);
  const huidig = (
    await query<{ klantId: number; aantalUren: number }>(
      `SELECT KlantId AS klantId, (SELECT COUNT(*) FROM dbo.Uur WHERE ProjectId=@id) AS aantalUren
       FROM dbo.Project WHERE ProjectId=@id`,
      { id },
    )
  )[0];
  if (!huidig) throw new HttpError(404, 'Project niet gevonden.');
  if (huidig.klantId !== v.klantId && huidig.aantalUren > 0) {
    throw new HttpError(409, 'De klant van een project kan niet meer worden gewijzigd zodra er uren op zijn geregistreerd.');
  }
  await query(
    `UPDATE dbo.Project SET KlantId=@klantId, Code=@code, Naam=@naam, Omschrijving=@omschrijving, Status=@status,
            StartDatum=CAST(@startDatum AS DATE), EindDatum=CAST(@eindDatum AS DATE), GewijzigdOp=SYSUTCDATETIME()
     WHERE ProjectId=@id`,
    { id, ...v },
  );
  return (await query(`${SELECT} WHERE p.ProjectId = @id`, { id }))[0];
});
