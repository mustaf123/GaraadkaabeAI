// account-delete: Profile > Delete this account (SPEC §6.8, FR-35, TC-33, TC-34).
// In:  {}  (user token)
// Out: { ok: true }, or E14 (balance not $0.00) / E10 / E11.
//
// auth_delete_account keeps the row for audit but sets status 'deleted' and phone
// NULL, deactivates devices, clears push tokens and revokes sessions, all in one
// transaction. Then the Supabase auth user is removed, which frees its internal
// email so the number can register again. If that last step fails, the account is
// still deleted; auth-register removes the leftover login later.

import { withSupabase } from 'npm:@supabase/server@1.8.0';
import { guarded, ok, readBody, rpc } from '../_shared/http.ts';
import { requireSession } from '../_shared/session.ts';

export default {
  fetch: withSupabase(
    { auth: 'user', errors: { detailed: false } },
    guarded(async (req, ctx) => {
      await readBody(req);
      const admin = ctx.supabaseAdmin;
      const session = await requireSession(ctx);

      const authUserId = await rpc<string>(admin, 'auth_delete_account', { p_user_id: session.userId });

      const { error } = await admin.auth.admin.deleteUser(authUserId);
      if (error) console.error(`delete: account deleted, removing its login failed: ${error.status ?? ''}`);
      return ok();
    }),
  ),
};
