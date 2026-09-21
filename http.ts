import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { isTransient, TransientDbError } from './db';
import { getCurrentUser, User } from './auth';

import { HttpError } from './errors';
export { HttpError };

export interface Ctx {
  req: HttpRequest;
  user: User;
  /** Route-parameters, bijv. {id} */
  params: Record<string, string>;
  /** Query-string parameters */
  query: URLSearchParams;
  /** Gelezen JSON-body (leeg object als er geen body is) */
  body: Record<string, unknown>;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type Handler = (ctx: Ctx) => Promise<unknown>;

/** Vertaal database-fouten naar nette HTTP-fouten. */
function toResponse(err: unknown, context: InvocationContext): HttpResponseInit {
  if (err instanceof HttpError) return { status: err.status, jsonBody: { error: err.message } };
  if (err instanceof TransientDbError || isTransient(err)) {
    context.warn('Tijdelijke databasefout', err);
    return {
      status: 503,
      jsonBody: { error: 'De database wordt opgestart. Probeer het over een halve minuut opnieuw.' },
    };
  }
  const number = (err as { number?: number })?.number;
  if (number === 2627 || number === 2601) {
    return { status: 409, jsonBody: { error: 'Deze gegevens bestaan al (dubbele waarde).' } };
  }
  if (number === 547) {
    return { status: 409, jsonBody: { error: 'Actie niet mogelijk: het item is gekoppeld aan andere gegevens.' } };
  }
  context.error('Onverwachte fout', err);
  return { status: 500, jsonBody: { error: 'Er ging iets mis op de server.' } };
}

/**
 * Registreer één endpoint. Het pad is relatief aan /api/.
 * role: 'admin' = alleen beheerders; 'user' = elke actieve medewerker (ook beheerders).
 */
export function endpoint(
  name: string,
  method: Method,
  route: string,
  role: 'admin' | 'user',
  handler: Handler,
) {
  app.http(name, {
    methods: [method],
    route,
    authLevel: 'anonymous', // toegang wordt afgedwongen door Static Web Apps + getCurrentUser()
    handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
      try {
        const user = await getCurrentUser(req);
        if (role === 'admin' && user.rol !== 'Admin') {
          throw new HttpError(403, 'Alleen beheerders mogen dit.');
        }
        let body: Record<string, unknown> = {};
        if (method === 'POST' || method === 'PUT') {
          const text = await req.text();
          if (text.trim()) {
            try {
              const parsed = JSON.parse(text);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed;
              else throw new Error('geen object');
            } catch {
              throw new HttpError(400, 'Ongeldige JSON in het verzoek.');
            }
          }
        }
        const result = await handler({
          req,
          user,
          params: req.params,
          query: new URL(req.url).searchParams,
          body,
        });
        if (result === undefined) return { status: 204 };
        return { status: 200, jsonBody: result };
      } catch (err) {
        return toResponse(err, context);
      }
    },
  });
}
