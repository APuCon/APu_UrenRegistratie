import { query } from '../lib/db';
import { endpoint, HttpError } from '../lib/http';
import { idParam, optBool, reqString } from '../lib/validate';

const SELECT = `SELECT FunctieId AS functieId, Naam AS naam, Actief AS actief FROM dbo.Functie`;

endpoint('functies-lijst', 'GET', 'functies', 'admin', async () => query(`${SELECT} ORDER BY Actief DESC, Naam`));

endpoint('functies-nieuw', 'POST', 'functies', 'admin', async ({ body }) => {
  const naam = reqString(body, 'naam', 'Naam', 100);
  const actief = optBool(body, 'actief', true);
  const rows = await query<{ id: number }>(
    `INSERT INTO dbo.Functie (Naam, Actief) OUTPUT INSERTED.FunctieId AS id VALUES (@naam, @actief)`,
    { naam, actief },
  );
  return (await query(`${SELECT} WHERE FunctieId = @id`, { id: rows[0].id }))[0];
});

endpoint('functies-wijzig', 'PUT', 'functies/{id}', 'admin', async ({ params, body }) => {
  const id = idParam(params);
  const naam = reqString(body, 'naam', 'Naam', 100);
  const actief = optBool(body, 'actief', true);
  const rows = await query(
    `UPDATE dbo.Functie SET Naam = @naam, Actief = @actief WHERE FunctieId = @id;
     ${SELECT} WHERE FunctieId = @id`,
    { id, naam, actief },
  );
  if (!rows.length) throw new HttpError(404, 'Functie niet gevonden.');
  return rows[0];
});
