// auth-disable-biometric: turn fingerprint login off (FR-31). Needs only a live
// session (turning a protection off on your own phone needs no PIN).
// In:  {}
// Out: { ok: true }, or E10 / E11.
// Stores a "Fingerprint login turned off" security alert (in-app only).

import { withSupabase } from 'npm:@supabase/server@1.8.0';
import { guarded, ok, readBody, rpc } from '../_shared/http.ts';
import { requireSession } from '../_shared/session.ts';

export default {
  fetch: withSupabase(
    { auth: 'user', errors: { detailed: false } },
    guarded(async (req, ctx) => {
      await readBody(req);
      const session = await requireSession(ctx);
      await rpc(ctx.supabaseAdmin, 'auth_set_biometric', { p_device_id: session.deviceId, p_biometric_secret_hash: null });
      return ok();
    }),
  ),
};
