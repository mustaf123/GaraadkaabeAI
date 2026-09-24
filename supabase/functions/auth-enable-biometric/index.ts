// auth-enable-biometric: turn fingerprint login on (FR-07, FR-31). Needs a live
// session AND the PIN; a wrong PIN counts toward the lockout like at login.
// E05 (this wrong PIN locked the login, or it was already locked) also ends this
// session: the app goes to Login.
// In:  { pin, biometric_secret }  (the new secret the app just stored with
//      requireAuthentication; the server keeps only its SHA-256 hash)
// Out: { ok: true }, or E04 (+ attempts_left) / E05 (+ locked_until) / E10 / E11.
// Stores a "Fingerprint login turned on" security alert (in-app only).

import { withSupabase } from 'npm:@supabase/server@1.8.0';
import { sha256 } from '../_shared/crypto.ts';
import { badRequest, guarded, ok, readBody, rpc } from '../_shared/http.ts';
import { accountOf, checkPin } from '../_shared/login.ts';
import { isDeviceSecret, isPin } from '../_shared/rules.ts';
import { requireSession } from '../_shared/session.ts';

export default {
  fetch: withSupabase(
    { auth: 'user', errors: { detailed: false } },
    guarded(async (req, ctx) => {
      const { pin, biometric_secret } = await readBody(req);
      if (!isPin(pin)) return badRequest('pin must be 4 digits');
      if (!isDeviceSecret(biometric_secret)) return badRequest('biometric_secret must be 64 hex characters');

      const admin = ctx.supabaseAdmin;
      const session = await requireSession(ctx);
      await checkPin(admin, await accountOf(admin, session.userId), pin, session.sessionId);

      await rpc(admin, 'auth_set_biometric', {
        p_device_id: session.deviceId,
        p_biometric_secret_hash: await sha256(biometric_secret),
      });
      return ok();
    }),
  ),
};
