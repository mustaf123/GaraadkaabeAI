// account-freeze: "This wasn't me" on the OLD phone (SPEC §6.4, FR-14, TC-26).
// Called with the publishable key: the old phone was logged out when the new one
// took over.
// In:  { phone, device_secret }  (the old phone's own device secret)
// Out: { ok: true }, or 403 when the request doesn't come from a phone this
//      account replaced in the last 7 days (the reason is not given away).
//
// Freezing revokes every session; the account can't log in (E10) or receive money
// (looks unregistered) until Forgot PIN, which unfreezes it.

import { withSupabase } from 'npm:@supabase/server@1.8.0';
import { sha256 } from '../_shared/crypto.ts';
import { appError, badRequest, forbidden, guarded, ok, readBody, rpc } from '../_shared/http.ts';
import { isDeviceSecret, isPhone } from '../_shared/rules.ts';

export default {
  fetch: withSupabase(
    { auth: 'publishable', errors: { detailed: false } },
    guarded(async (req, ctx) => {
      const { phone, device_secret } = await readBody(req);
      if (!isPhone(phone)) return appError('E01');
      if (!isDeviceSecret(device_secret)) return badRequest('device_secret must be 64 hex characters');

      const frozen = await rpc<boolean>(ctx.supabaseAdmin, 'auth_freeze', {
        p_phone: phone,
        p_device_secret_hash: await sha256(device_secret),
      });
      return frozen ? ok() : forbidden();
    }),
  ),
};
