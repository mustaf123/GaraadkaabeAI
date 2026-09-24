// Responses and errors shared by the auth Edge Functions.
//
// App errors use the SPEC §11 code: { "error": "E04", "attempts_left": 2 }. The app
// maps the code to its message. Anything unexpected is a plain 500 with no details;
// the reason goes to the function log, never a PIN, code, secret or token.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.0';
import type { SupabaseContext } from 'npm:@supabase/server@1.8.0';

const STATUS: Record<string, number> = {
  E01: 400, // invalid number
  E03: 400, // weak PIN
  E04: 401, // wrong PIN
  E05: 423, // login locked
  E06: 404, // number not registered
  E10: 403, // account frozen
  E11: 401, // session ended
  E13: 401, // fingerprint not recognized: use the PIN
  E14: 409, // balance not 0
  E16: 401, // wrong recovery code
  E17: 423, // recovery locked
  E18: 409, // number already registered
};

// Thrown by helpers to end a request with a ready response.
export class Reply extends Error {
  constructor(readonly response: Response) {
    super('reply');
  }
}

export function ok(body: Record<string, unknown> = { ok: true }): Response {
  return Response.json(body);
}

export function appError(code: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error: code, ...extra }, { status: STATUS[code] ?? 400 });
}

export function badRequest(message: string): Response {
  return Response.json({ error: 'bad_request', message }, { status: 400 });
}

export function forbidden(): Response {
  return Response.json({ error: 'forbidden' }, { status: 403 });
}

// The JSON body of a POST, or a 400 reply.
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method !== 'POST') {
    throw new Reply(Response.json({ error: 'method_not_allowed' }, { status: 405 }));
  }
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new Reply(badRequest('expected a JSON object'));
}

// Calls a database function. An 'Exx' error from the database becomes that app error;
// anything else is unexpected.
export async function rpc<T>(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    if (/^E\d\d$/.test(error.message)) throw new Reply(appError(error.message));
    throw new Error(`${name} failed: ${error.message}`);
  }
  return data as T;
}

// Wraps a handler: a Reply ends the request with its response; any other error is
// logged (message only) and answered with a bare 500.
export function guarded(
  handler: (req: Request, ctx: SupabaseContext) => Promise<Response>,
): (req: Request, ctx: SupabaseContext) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      if (error instanceof Reply) return error.response;
      console.error(error instanceof Error ? error.message : 'unknown error');
      return Response.json({ error: 'server_error' }, { status: 500 });
    }
  };
}
