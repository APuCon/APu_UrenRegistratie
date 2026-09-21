import { query, transaction } from '../lib/db';
import { endpoint, HttpError } from '../lib/http';
import {
  idParam, isValidEmail, optBool, optString, reqDate, reqDecimal, reqInt, reqString,
} from '../lib/validate';

const KLANT_SELECT = `
  SELECT k.KlantId AS klantId, k.Naam AS naam, k.Contactpersoon AS contactpersoon, k.Email AS email,
         k.Telefoon AS telefoon, k.Adres AS adres, k.Postcode AS postcode, k.Plaats AS plaats,
         k.KvkNummer AS kvkNummer, k.BtwNummer AS btwNummer, k.Notities AS notities, k.Actief AS actief,
         (SELECT COUNT(*) FROM dbo.Project p WHERE p.KlantId = k.KlantId AND p.Status = N'Actief') AS actieveProjecten
  FROM dbo.Klant k`;

const TARIEF_SELECT = `
  SELECT t.TariefId AS tariefId, t.KlantId AS klantId, t.FunctieId AS functieId, f.Naam AS functieNaam,
         t.UurTarief AS uurTarief, CONVERT(char(10), t.GeldigVanaf, 23) AS geldigVanaf,
         (SELECT COUNT(*) FROM dbo.Uur u WHERE u.TariefId = t.TariefId) AS aantalUren
  FROM dbo.Tarief t
  JOIN dbo.Functie f ON f.FunctieId = t.FunctieId`;

function klantVelden(body: Record<string, unknown>) {
  const email = optString(body, 'email', 'E-mail', 320);
  if (email && !isValidEmail(email)) throw new HttpError(400, 'E-mailadres is ongeldig.');
  return {
    naam: reqString(body, 'naam', 'Naam', 200),
    contactpersoon: optString(body, 'contactpersoon', 'Contactpersoon', 200),
    email,
    telefoon: optString(body, 'telefoon', 'Telefoon', 50),
    adres: optString(body, 'adres', 'Adres', 200),
    postcode: optString(body, 'postcode', 'Postcode', 20),
    plaats: optString(body, 'plaats', 'Plaats', 100),
    kvkNummer: optString(body, 'kvkNummer', 'KvK-nummer', 20),
    btwNummer: optString(body, 'btwNummer', 'BTW-nummer', 30),
    notities: optString(body, 'notities', 'Notities', 4000),
    actief: optBool(body, 'actief', true),
  };
}

endpoint('klanten-lijst', 'GET', 'klanten', 'admin', async () =>
  query(`${KLANT_SELECT} ORDER BY k.Actief DESC, k.Naam`),
);

endpoint('klanten-detail', 'GET', 'klanten/{id}', 'admin', async ({ params }) => {
  const id = idParam(params);
  const klant = (await query(`${KLANT_SELECT} WHERE k.KlantId = @id`, { id }))[0];
  if (!klant) throw new HttpError(404, 'Klant niet gevonden.');
  return klant;
});

endpoint('klanten-nieuw', 'POST', 'klanten', 'admin', async ({ body }) => {
  const v = klantVelden(body);
  const rows = await query<{ id: number }>(
    `INSERT INTO dbo.Klant (Naam, Contactpersoon, Email, Telefoon, Adres, Postcode, Plaats, KvkNummer, BtwNummer, Notities, Actief)
     OUTPUT INSERTED.KlantId AS id
     VALUES (@naam, @contactpersoon, @email, @telefoon, @adres, @postcode, @plaats, @kvkNummer, @btwNummer, @notities, @actief)`,
    v,
  );
  return (await query(`${KLANT_SELECT} WHERE k.KlantId = @id`, { id: rows[0].id }))[0];
});

endpoint('klanten-wijzig', 'PUT', 'klanten/{id}', 'admin', async ({ params, body }) => {
  const id = idParam(params);
  const v = klantVelden(body);
  const rows = await query(
    `UPDATE dbo.Klant SET Naam=@naam, Contactpersoon=@contactpersoon, Email=@email, Telefoon=@telefoon, Adres=@adres,
            Postcode=@postcode, Plaats=@plaats, KvkNummer=@kvkNummer, BtwNummer=@btwNummer, Notities=@notities,
            Actief=@actief, GewijzigdOp=SYSUTCDATETIME()
     WHERE KlantId=@id;
     ${KLANT_SELECT} WHERE k.KlantId = @id`,
    { id, ...v },
  );
  if (!rows.length) throw new HttpError(404, 'Klant niet gevonden.');
  return rows[0];
});

/* ------------------------------ Tarieven ------------------------------ */

endpoint('tarieven-lijst', 'GET', 'klanten/{id}/tarieven', 'admin', async ({ params }) => {
  const klantId = idParam(params);
  return query(`${TARIEF_SELECT} WHERE t.KlantId = @klantId ORDER BY f.Naam, t.GeldigVanaf DESC`, { klantId });
});

endpoint('tarieven-nieuw', 'POST', 'klanten/{id}/tarieven', 'admin', async ({ params, body }) => {
  const klantId = idParam(params);
  const functieId = reqInt(body, 'functieId', 'Functie');
  const uurTarief = reqDecimal(body, 'uurTarief', 'Uurtarief', 0, 10000);
  const geldigVanaf = reqDate(body, 'geldigVanaf', 'Geldig vanaf');

  const klant = await query(`SELECT 1 AS x FROM dbo.Klant WHERE KlantId = @klantId`, { klantId });
  if (!klant.length) throw new HttpError(404, 'Klant niet gevonden.');
  const functie = await query(`SELECT 1 AS x FROM dbo.Functie WHERE FunctieId = @functieId`, { functieId });
  if (!functie.length) throw new HttpError(400, 'Functie bestaat niet.');

  const dubbel = await query(
    `SELECT 1 AS x FROM dbo.Tarief WHERE KlantId=@klantId AND FunctieId=@functieId AND GeldigVanaf=CAST(@geldigVanaf AS DATE)`,
    { klantId, functieId, geldigVanaf },
  );
  if (dubbel.length) {
    throw new HttpError(409, 'Er bestaat al een tarief voor deze functie met dezelfde ingangsdatum. Wijzig dat tarief.');
  }
  const rows = await query<{ id: number }>(
    `INSERT INTO dbo.Tarief (KlantId, FunctieId, UurTarief, GeldigVanaf)
     OUTPUT INSERTED.TariefId AS id
     VALUES (@klantId, @functieId, @uurTarief, CAST(@geldigVanaf AS DATE))`,
    { klantId, functieId, uurTarief, geldigVanaf },
  );
  return (await query(`${TARIEF_SELECT} WHERE t.TariefId = @id`, { id: rows[0].id }))[0];
});

endpoint('tarieven-wijzig', 'PUT', 'tarieven/{id}', 'admin', async ({ params, body }) => {
  const id = idParam(params);
  const uurTarief = reqDecimal(body, 'uurTarief', 'Uurtarief', 0, 10000);
  const geldigVanaf = reqDate(body, 'geldigVanaf', 'Geldig vanaf');
  const herbereken = optBool(body, 'herberekenOpenUren', false);

  return transaction(async (q) => {
    const huidig = (
      await q<{ klantId: number; functieId: number; geldigVanaf: string; aantalUren: number }>(
        `SELECT t.KlantId AS klantId, t.FunctieId AS functieId, CONVERT(char(10), t.GeldigVanaf, 23) AS geldigVanaf,
                (SELECT COUNT(*) FROM dbo.Uur u WHERE u.TariefId = t.TariefId) AS aantalUren
         FROM dbo.Tarief t WITH (UPDLOCK) WHERE t.TariefId = @id`,
        { id },
      )
    )[0];
    if (!huidig) throw new HttpError(404, 'Tarief niet gevonden.');
    if (huidig.aantalUren > 0 && huidig.geldigVanaf !== geldigVanaf) {
      throw new HttpError(
        409,
        'De ingangsdatum kan niet meer worden gewijzigd omdat er uren op dit tarief zijn geregistreerd. Voeg een nieuw tarief toe met de gewenste ingangsdatum.',
      );
    }
    const dubbel = await q(
      `SELECT 1 AS x FROM dbo.Tarief WHERE KlantId=@klantId AND FunctieId=@functieId
         AND GeldigVanaf=CAST(@geldigVanaf AS DATE) AND TariefId <> @id`,
      { id, klantId: huidig.klantId, functieId: huidig.functieId, geldigVanaf },
    );
    if (dubbel.length) throw new HttpError(409, 'Er bestaat al een tarief voor deze functie met dezelfde ingangsdatum.');

    await q(`UPDATE dbo.Tarief SET UurTarief=@uurTarief, GeldigVanaf=CAST(@geldigVanaf AS DATE) WHERE TariefId=@id`, {
      id, uurTarief, geldigVanaf,
    });
    let herberekend = 0;
    if (herbereken) {
      // Alleen niet-gefactureerde uren: gefactureerde uren blijven ongewijzigd.
      const r = await q<{ n: number }>(
        `UPDATE dbo.Uur SET UurTarief=@uurTarief, GewijzigdOp=SYSUTCDATETIME()
         WHERE TariefId=@id AND FacturatieId IS NULL AND UurTarief <> @uurTarief;
         SELECT @@ROWCOUNT AS n;`,
        { id, uurTarief },
      );
      herberekend = r[0]?.n ?? 0;
    }
    const tarief = (await q(`${TARIEF_SELECT} WHERE t.TariefId = @id`, { id }))[0];
    return { ...tarief, herberekend };
  });
});

endpoint('tarieven-verwijder', 'DELETE', 'tarieven/{id}', 'admin', async ({ params }) => {
  const id = idParam(params);
  const rows = await query<{ aantalUren: number }>(
    `SELECT (SELECT COUNT(*) FROM dbo.Uur WHERE TariefId = @id) AS aantalUren FROM dbo.Tarief WHERE TariefId = @id`,
    { id },
  );
  if (!rows.length) throw new HttpError(404, 'Tarief niet gevonden.');
  if (rows[0].aantalUren > 0) {
    throw new HttpError(409, 'Dit tarief is in gebruik bij geregistreerde uren en kan niet worden verwijderd.');
  }
  await query(`DELETE FROM dbo.Tarief WHERE TariefId = @id`, { id });
  return undefined;
});
