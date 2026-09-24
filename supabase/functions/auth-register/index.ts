// auth-register: a new account (SPEC §6.1, FR-02..FR-09).
// Called before login, with the publishable key.
// In:  { phone, pin, device_secret, device_name? }
// Out: { session, recovery_code }, or E01 / E03 / E18.
//
// The recovery code is shown once and never again, so once the account exists it
// is always returned; if opening the first session fails, session is null and the
// app sends the user to Login after showing the code.

import { withSupabase } from 'npm:@supabase/server@1.8.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.0';
import { hashSecret, newRecoveryCode, randomPassword, sha256 } from '../_shared/crypto.ts';
import { appError, badRequest, guarded, ok, readBody, Reply, rpc } from '../_shared/http.ts';
import { deviceName, internalEmail, isDeviceSecret, isPhone, isPin, isWeakPin } from '../_shared/rules.ts';
import { openSession, type SessionTokens } from '../_shared/session.ts';

// Creates the Supabase auth user. If the internal email is taken by a login no live
// account uses (left over from a crash or a failed delete), that login is removed
// and the create is tried once more. Otherwise the number is registered: E18.
async function createLogin(admin: SupabaseClient, phone: string, password: string): Promise<string> {
  const email = internalEmail(phone);
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (!error) return data.user.id;
    if (error.code !== 'email_exists') throw new Error(`create login failed: ${error.status} ${error.code}`);

    const orphan = await rpc<string | null>(admin, 'auth_orphan_login', { p_email: email });
    if (!orphan) break;
    const removed = await admin.auth.admin.deleteUser(orphan);
    if (removed.error) throw new Error(`remove leftover login failed: ${removed.error.message}`);
  }
  throw new Reply(appError('E18'));
}

export default {
  fetch: withSupabase(
    { auth: 'publishable', errors: { detailed: false } },
    guarded(async (req, ctx) => {
      const body = await readBody(req);
      const { phone, pin, device_secret } = body;
      if (!isPhone(phone)) return appError('E01');
      if (!isPin(pin)) return badRequest('pin must be 4 digits');
      if (isWeakPin(pin, phone)) return appError('E03');
      if (!isDeviceSecret(device_secret)) return badRequest('device_secret must be 64 hex characters');

      const admin = ctx.supabaseAdmin;

      // Cheap check first, so a registered number never costs two bcrypt hashes.
      if (await rpc<boolean>(admin, 'auth_phone_registered', { p_phone: phone })) return appError('E18');

      const recoveryCode = newRecoveryCode();
      const [pinHash, recoveryHash, deviceHash] = await Promise.all([
        hashSecret('pin', pin),
        hashSecret('recovery', recoveryCode.replace('-', '')),
        sha256(device_secret),
      ]);

      const password = randomPassword();
      const authUserId = await createLogin(admin, phone, password);

      // Every row of the account plus the $100.00 welcome bonus, in one transaction.
      let account: { user_id: string; device_id: string };
      try {
        account = await rpc(admin, 'auth_register_user', {
          p_auth_user_id: authUserId,
          p_phone: phone,
          p_pin_hash: pinHash,
          p_recovery_hash: recoveryHash,
          p_device_secret_hash: deviceHash,
          p_device_name: deviceName(body.device_name),
        });
      } catch (error) {
        // Nothing was written: remove the login again so the number stays free.
        await admin.auth.admin.deleteUser(authUserId);
        throw error;
      }

      let session: SessionTokens | null = null;
      try {
        session = await openSession(admin, {
          userId: account.user_id,
          deviceId: account.device_id,
          authUserId,
          phone,
          method: 'register',
          password,
        });
      } catch (error) {
        console.error(`register: account created, first session failed: ${(error as Error).message}`);
      }

      return ok({ session, recovery_code: recoveryCode });
    }),
  ),
};
