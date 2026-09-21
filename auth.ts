import { HttpRequest } from '@azure/functions';
import { query } from './db';
import { HttpError } from './errors';

export interface User {
  medewerkerId: number;
  email: string;
  naam: string;
  rol: 'Admin' | 'Medewerker';
  standaardFunctieId: number | null;
}

interface ClientPrincipal {
  identityProvider?: string;
  userId?: string;
  userDetails?: string;
  userRoles?: string[];
}

/** Lees de door Static Web Apps meegegeven (en gesigneerde) gebruiker uit de header x-ms-client-principal. */
export function readPrincipal(req: HttpRequest): ClientPrincipal | null {
  const header = req.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as ClientPrincipal;
  } catch {
    return null;
  }
}

/** E-mailadressen (kommagescheiden) die altijd beheerder zijn. Voorkomt dat je jezelf buitensluit. */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

const USER_SQL = `
  SELECT MedewerkerId AS medewerkerId, Email AS email, Naam AS naam, Rol AS rol,
         StandaardFunctieId AS standaardFunctieId, Actief AS actief
  FROM dbo.Medewerker WHERE Email = @email`;

type Row = User & { actief: boolean };

/**
 * Bepaal wie er aanroept en welke rol die persoon in de app heeft.
 * - Geen (geldige) aanmelding  -> 401
 * - Wel aangemeld maar niet als medewerker geregistreerd of niet actief -> 403
 * - E-mailadressen in ADMIN_EMAILS worden automatisch aangemaakt / hersteld als Admin.
 */
export async function getCurrentUser(req: HttpRequest): Promise<User> {
  const principal = readPrincipal(req);
  const email = (principal?.userDetails ?? '').trim().toLowerCase();
  if (!principal || !email || !principal.userRoles?.includes('authenticated')) {
    throw new HttpError(401, 'Niet aangemeld.');
  }

  let rows = await query<Row>(USER_SQL, { email });
  const isBootstrapAdmin = adminEmails().includes(email);

  if (isBootstrapAdmin && (rows.length === 0 || rows[0].rol !== 'Admin' || !rows[0].actief)) {
    const naam = email.split('@')[0].replace(/[._-]+/g, ' ');
    await query(
      `MERGE dbo.Medewerker AS t
       USING (SELECT @email AS Email) AS s ON t.Email = s.Email
       WHEN MATCHED THEN UPDATE SET Rol = N'Admin', Actief = 1
       WHEN NOT MATCHED THEN INSERT (Email, Naam, Rol, Actief) VALUES (@email, @naam, N'Admin', 1);`,
      { email, naam },
    );
    rows = await query<Row>(USER_SQL, { email });
  }

  const row = rows[0];
  if (!row || !row.actief) {
    throw new HttpError(403, 'Je hebt geen toegang tot deze applicatie. Vraag de beheerder om je toe te voegen.');
  }
  return {
    medewerkerId: row.medewerkerId,
    email: row.email,
    naam: row.naam,
    rol: row.rol,
    standaardFunctieId: row.standaardFunctieId,
  };
}
