// auth-check-phone: is this number registered? (SPEC §6.1, FR-03)
// Called before login, with the publishable key.
// In:  { phone }
// Out: { registered: boolean }, or E01.

import { withSupabase } from 'npm:@supabase/server@1.8.0';
import { appError, guarded, ok, readBody, rpc } from '../_shared/http.ts';
import { isPhone } from '../_shared/rules.ts';

export default {
  fetch: withSupabase(
    { auth: 'publishable', errors: { detailed: false } },
    guarded(async (req, ctx) => {
      const { phone } = await readBody(req);
      if (!isPhone(phone)) return appError('E01');

      const registered = await rpc<boolean>(ctx.supabaseAdmin, 'auth_phone_registered', { p_phone: phone });
      return ok({ registered });
    }),
  ),
};
