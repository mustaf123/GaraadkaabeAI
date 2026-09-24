// auth-login: log in with the PIN (SPEC §6.2, §6.4, FR-10..FR-14).
// Called before login, with the publishable key.
// In:  { phone, pin, device_secret, device_name? }
// Out: { session, new_device }, or E01 / E04 (+ attempts_left) / E05 (+ locked_until) / E06 / E10.
//
// Order (SPEC §6.2): account not frozen or locked, then the PIN under the lockout
// rules, then the device. A device secret that isn't the active device's is a new
// phone: it is bound, the old one deactivated and alerted (FR-14). A normal login on
// the same phone creates no alert.

import { withSupabase } from 'npm:@supabase/server@1.8.0';
import { appError, badRequest, guarded, ok, readBody } from '../_shared/http.ts';
import { bindDevice, checkPin, findAccount, requireLoginAllowed } from '../_shared/login.ts';
import { isDeviceSecret, isPhone, isPin } from '../_shared/rules.ts';
import { openSession } from '../_shared/session.ts';

export default {
  fetch: withSupabase(
    { auth: 'publishable', errors: { detailed: false } },
    guarded(async (req, ctx) => {
      const body = await readBody(req);
      const { phone, pin, device_secret } = body;
      if (!isPhone(phone)) return appError('E01');
      if (!isPin(pin)) return badRequest('pin must be 4 digits');
      if (!isDeviceSecret(device_secret)) return badRequest('device_secret must be 64 hex characters');

      const admin = ctx.supabaseAdmin;
      const account = await findAccount(admin, phone, 'login');
      requireLoginAllowed(account);
      await checkPin(admin, account, pin);

      const binding = await bindDevice(admin, account.user_id, device_secret, body.device_name);

      const session = await openSession(admin, {
        userId: account.user_id,
        deviceId: binding.device_id,
        authUserId: account.auth_user_id,
        phone,
        method: 'pin',
      });

      return ok({ session, new_device: binding.is_new });
    }),
  ),
};
