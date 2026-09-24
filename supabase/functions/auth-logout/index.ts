// auth-logout: the Log out button (SPEC §6.7, §6.4b step 5).
// In:  {}  (user token)
// Out: { ok: true }
//
// Revokes this session and clears this device's push token, so a phone that logged
// out gets no more pushes. Automatic logouts (60 s idle, background) never call
// this, so a closed app keeps receiving them.
// No 60 s idle check here: Log out must work even right after the session timed
// out. The token's signature is still verified, so only its holder can log it out.

import { withSupabase } from 'npm:@supabase/server@1.8.0';
import { appError, guarded, ok, readBody, rpc } from '../_shared/http.ts';

export default {
  fetch: withSupabase(
    { auth: 'user', errors: { detailed: false } },
    guarded(async (req, ctx) => {
      await readBody(req);
      const sessionId = ctx.jwtClaims?.session_id;
      if (typeof sessionId !== 'string') return appError('E11');

      await rpc(ctx.supabaseAdmin, 'auth_logout', { p_auth_session_id: sessionId });

      // Also end the Supabase Auth session (its refresh token). Our own session row
      // is already revoked, so a failure here changes nothing for the app.
      const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (jwt) {
        const { error } = await ctx.supabaseAdmin.auth.admin.signOut(jwt, 'local');
        if (error) console.error(`logout: auth sign-out failed: ${error.status ?? ''}`);
      }
      return ok();
    }),
  ),
};
