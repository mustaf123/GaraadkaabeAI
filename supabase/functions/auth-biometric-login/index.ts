// auth-biometric-login: log in with the fingerprint (SPEC §6.3, FR-11, TC-28).
// Called before login, with the publishable key.
// In:  { phone, biometric_secret, device_secret }
// Out: { session }, or E01 / E05 (+ locked_until) / E06 / E10 / E13.
//
// The app reads biometric_secret from SecureStore with requireAuthentication, so a
// successful read proves the fingerprint; the server only ever sees that secret.
// It works only on the active device (a new phone needs the PIN, FR-14). A lock
// from wrong PINs blocks this too. E13 tells the app to fall back to the PIN; the
// secrets are 32 random bytes, so a mismatch is not counted toward the PIN lockout.

import { withSupabase } from 'npm:@supabase/server@1.8.0';
import { sameHash, sha256 } from '../_shared/crypto.ts';
import { appError, badRequest, guarded, ok, readBody, rpc } from '../_shared/http.ts';
import { findAccount, requireLoginAllowed } from '../_shared/login.ts';
import { isDeviceSecret, isPhone } from '../_shared/rules.ts';
import { openSession } from '../_shared/session.ts';

export default {
  fetch: withSupabase(
    { auth: 'publishable', errors: { detailed: false } },
    guarded(async (req, ctx) => {
      const { phone, biometric_secret, device_secret } = await readBody(req);
      if (!isPhone(phone)) return appError('E01');
      if (!isDeviceSecret(device_secret)) return badRequest('device_secret must be 64 hex characters');
      if (!isDeviceSecret(biometric_secret)) return badRequest('biometric_secret must be 64 hex characters');

      const admin = ctx.supabaseAdmin;
      const account = await findAccount(admin, phone, 'biometric_login');
      requireLoginAllowed(account);

      // Both hashes are always computed and compared, so timing doesn't tell which failed.
      const [deviceHash, biometricHash] = await Promise.all([sha256(device_secret), sha256(biometric_secret)]);
      const deviceOk = sameHash(account.device_secret_hash, deviceHash);
      const biometricOk = sameHash(account.biometric_secret_hash, biometricHash);
      if (!account.device_id || !deviceOk || !biometricOk) {
        await rpc(admin, 'auth_audit', {
          p_user_id: account.user_id,
          p_device_id: deviceOk ? account.device_id : null,
          p_action: 'biometric_failed',
          p_details: { device_matched: deviceOk },
        });
        return appError('E13');
      }

      // A successful login resets the PIN fail and lockout counts (SPEC §6.2).
      await rpc(admin, 'auth_attempt_end', { p_user_id: account.user_id, p_kind: 'pin', p_ok: true });

      const session = await openSession(admin, {
        userId: account.user_id,
        deviceId: account.device_id,
        authUserId: account.auth_user_id,
        phone,
        method: 'biometric',
      });
      return ok({ session });
    }),
  ),
};
