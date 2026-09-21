import { query } from '../lib/db';
import { endpoint, HttpError } from '../lib/http';
import { idParam, isValidEmail, oneOf, optBool, optInt, reqString } from '../lib/validate';

const SELECT = `
  SELECT m.MedewerkerId AS medewerkerId, m.Email AS email, m.Naam AS naam, m.Rol AS rol,
         m.StandaardFunctieId AS standaardFunctieId, f.Naam AS standaardFunctieNaam, m.Actief AS actief
  FROM dbo.Medewerker m
  LEFT JOIN dbo.Functie f ON f.FunctieId = m.StandaardFunctieId`;

function velden(body: Record<string, unknown>) {
  const email = reqString(body, 'email', 'E-mailadres', 320).toLowerCase();
  if (!isValidEmail(email)) throw new HttpError(400, 'E-mailadres is ongeldig.');
  return {
    email,
    naam: reqString(body, 'naam', 'Naam', 200),
    rol: oneOf(body, 'rol', 'Rol', ['Admin', 'Medewerker'] as const, 'Medewerker'),
    standaardFunctieId: optInt(body, 'standaardFunctieId', 'Standaardfunctie'),
    actief: optBool(body, 'actief', true),
  };
}

endpoint('medewerkers-lijst', 'GET', 'medewerkers', 'admin', async () =>
  query(`${SELECT} ORDER BY m.Actief DESC, m.Naam`),
);

endpoint('medewerkers-nieuw', 'POST', 'medewerkers', 'admin', async ({ body }) => {
  const v = velden(body);
  const rows = await query<{ id: number }>(
    `INSERT INTO dbo.Medewerker (Email, Naam, Rol, StandaardFunctieId, Actief)
     OUTPUT INSERTED.MedewerkerId AS id
     VALUES (@email, @naam, @rol, @standaardFunctieId, @actief)`,
    v,
  );
  return (await query(`${SELECT} WHERE m.MedewerkerId = @id`, { id: rows[0].id }))[0];
});

endpoint('medewerkers-wijzig', 'PUT', 'medewerkers/{id}', 'admin', async ({ params, body, user }) => {
  const id = idParam(params);
  const v = velden(body);
  if (id === user.medewerkerId && (v.rol !== 'Admin' || !v.actief || v.email !== user.email)) {
    throw new HttpError(400, 'Je kunt je eigen rol, status of e-mailadres niet wijzigen (om buitensluiten te voorkomen).');
  }
  const rows = await query(
    `UPDATE dbo.Medewerker SET Email=@email, Naam=@naam, Rol=@rol, StandaardFunctieId=@standaardFunctieId, Actief=@actief
     WHERE MedewerkerId=@id;
     ${SELECT} WHERE m.MedewerkerId = @id`,
    { id, ...v },
  );
  if (!rows.length) throw new HttpError(404, 'Medewerker niet gevonden.');
  return rows[0];
});
