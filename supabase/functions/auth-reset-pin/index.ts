// auth-reset-pin: Forgot PIN (SPEC §6.6, FR-36, TC-25).
// Called before login, with the publishable key.
// In:  { phone, recovery_code, new_pin, device_secret, device_name? }
// Out: { session, recovery_code, new_device }, or E01 / E03 / E06 /
//      E16 (+ attempts_left) / E17 (+ locked_until).
//
// The recovery code proves ownership, so a reset also clears the PIN lock and
// unfreezes a frozen account. It issues a NEW recovery code (the old one dies),
// revokes every earlier session and logs in on this phone (new-device flow if it
// is a different phone). Once the reset is saved the new code is always returned:
// if the login after it fails, session is null and the app sends the user to Login.

import { withSupabase } from 'npm:@supabase/server@1.8.0';
import { hashSecret, newRecoveryCode, verifySecret } from '../_shared/crypto.ts';
import { appError, badRequest, guarded, ok, readBody, Reply, rpc } from '../_shared/http.ts';
import { bindDevice, findAccount, type RegisteredAccount } from '../_shared/login.ts';
import { isDeviceSecret, isPhone, isPin, isWeakPin, normalizeRecoveryCode } from '../_shared/rules.ts';
import { openSession, type SessionTokens } from '../_shared/session.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.0';

// Same rule as the PIN: the attempt is counted BEFORE the hash is checked.
// 3 wrong codes lock recovery for 24 h.
async function checkRecoveryCode(admin: SupabaseClient, account: RegisteredAccount, code: string): Promise<void> {
  const begin = await rpc<{ allowed: boolean; locked_until: string | null }>(admin, 'auth_attempt_begin', {
    p_user_id: account.user_id,
    p_kind: 'recovery',
  });
  if (!begin.allowed) throw new Reply(appError('E17', { locked_until: begin.locked_until }));

  const correct = !!account.recovery_hash && (await verifySecret('recovery', code, account.recovery_hash));

  const end = await rpc<{ attempts_left: number; locked_until: string | null }>(admin, 'auth_attempt_end', {
    p_user_id: account.user_id,
    p_kind: 'recovery',
    p_ok: correct,
  });
  if (correct) return;
  if (end.locked_until) throw new Reply(appError('E17', { locked_until: end.locked_until }));
  throw new Reply(appError('E16', { attempts_left: end.attempts_left }));
}

export default {
  fetch: withSupabase(
    { auth: 'publishable', errors: { detailed: false } },
    guarded(async (req, ctx) => {
      const body = await readBody(req);
      const { phone, new_pin, device_secret } = body;
      if (!isPhone(phone)) return appError('E01');
      const code = normalizeRecoveryCode(body.recovery_code);
      if (!code) return badRequest('recovery_code must be XXXX-XXXX');
      if (!isPin(new_pin)) return badRequest('new_pin must be 4 digits');
      // Checked before the code, so a weak PIN never uses up a recovery attempt.
      if (isWeakPin(new_pin, phone)) return appError('E03');
      if (!isDeviceSecret(device_secret)) return badRequest('device_secret must be 64 hex characters');

      const admin = ctx.supabaseAdmin;
      const account = await findAccount(admin, phone, 'reset');
      await checkRecoveryCode(admin, account, code);

      const recoveryCode = newRecoveryCode();
      const [pinHash, recoveryHash] = await Promise.all([
        hashSecret('pin', new_pin),
        hashSecret('recovery', recoveryCode.replace('-', '')),
      ]);
      await rpc(admin, 'auth_reset_pin', {
        p_user_id: account.user_id,
        p_pin_hash: pinHash,
        p_recovery_hash: recoveryHash,
      });

      let session: SessionTokens | null = null;
      let newDevice = false;
      try {
        const binding = await bindDevice(admin, account.user_id, device_secret, body.device_name);
        newDevice = binding.is_new;
        session = await openSession(admin, {
          userId: account.user_id,
          deviceId: binding.device_id,
          authUserId: account.auth_user_id,
          phone,
          method: 'reset',
        });
      } catch (error) {
        console.error(`reset: PIN reset saved, login after it failed: ${(error as Error).message}`);
      }

      return ok({ session, recovery_code: recoveryCode, new_device: newDevice });
    }),
  ),
};
