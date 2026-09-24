// auth-change-pin: Profile > Change PIN (FR-32, TC-35).
// Needs a live session AND the current PIN. A wrong current PIN counts toward the
// lockout exactly like a wrong PIN at login. E05 (this wrong PIN locked the login,
// or it was already locked) also ends this session: the app goes to Login.
// In:  { current_pin, new_pin }
// Out: { ok: true }, or E03 / E04 (+ attempts_left) / E05 (+ locked_until) / E10 / E11.
// Stores a "PIN changed" security alert (in-app only).

import { withSupabase } from 'npm:@supabase/server@1.8.0';
import { hashSecret } from '../_shared/crypto.ts';
import { appError, badRequest, guarded, ok, readBody, rpc } from '../_shared/http.ts';
import { accountOf, checkPin } from '../_shared/login.ts';
import { isPin, isWeakPin } from '../_shared/rules.ts';
import { requireSession } from '../_shared/session.ts';

export default {
  fetch: withSupabase(
    { auth: 'user', errors: { detailed: false } },
    guarded(async (req, ctx) => {
      const { current_pin, new_pin } = await readBody(req);
      if (!isPin(current_pin)) return badRequest('current_pin must be 4 digits');
      if (!isPin(new_pin)) return badRequest('new_pin must be 4 digits');

      const admin = ctx.supabaseAdmin;
      const session = await requireSession(ctx);
      const account = await accountOf(admin, session.userId);
      // Checked before the current PIN, so a weak new PIN never uses up an attempt.
      if (isWeakPin(new_pin, account.phone)) return appError('E03');
      await checkPin(admin, account, current_pin, session.sessionId);

      await rpc(admin, 'auth_set_pin', { p_user_id: session.userId, p_pin_hash: await hashSecret('pin', new_pin) });
      return ok();
    }),
  ),
};
