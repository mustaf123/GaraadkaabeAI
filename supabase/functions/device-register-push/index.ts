// device-register-push: save this phone's Expo push token (SPEC §6.4b step 1).
// Called after every successful login.
// In:  { push_token }  (user token; e.g. ExponentPushToken[xxxx])
// Out: { ok: true }, or E10 / E11.
//
// The token goes on this session's device only. The same token is removed from any
// other device row, so one phone never gets another account's pushes.

import { withSupabase } from 'npm:@supabase/server@1.8.0';
import { badRequest, guarded, ok, readBody, rpc } from '../_shared/http.ts';
import { isPushToken } from '../_shared/rules.ts';
import { requireSession } from '../_shared/session.ts';

export default {
  fetch: withSupabase(
    { auth: 'user', errors: { detailed: false } },
    guarded(async (req, ctx) => {
      const { push_token } = await readBody(req);
      if (!isPushToken(push_token)) return badRequest('push_token must be an Expo push token');

      const session = await requireSession(ctx);
      await rpc(ctx.supabaseAdmin, 'auth_set_push_token', { p_device_id: session.deviceId, p_push_token: push_token });
      return ok();
    }),
  ),
};
