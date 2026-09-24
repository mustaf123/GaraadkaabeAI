// Shared by the functions that log a user in with a phone number (auth-login,
// auth-biometric-login, auth-reset-pin): finding the account and the PIN attempt rules.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.0';
import { sha256, verifySecret } from './crypto.ts';
import { appError, Reply, rpc } from './http.ts';
import { sendPush } from './push.ts';
import { deviceName } from './rules.ts';

// One row of auth_lookup. user_id is NULL for a number nobody uses.
export interface Account {
  user_id: string | null;
  auth_user_id: string | null;
  status: 'active' | 'locked' | 'frozen' | 'deleted' | null;
  pin_hash: string | null;
  recovery_hash: string | null;
  locked_until: string | null;
  recovery_locked_until: string | null;
  device_id: string | null;
  device_secret_hash: string | null;
  biometric_secret_hash: string | null;
}

export type RegisteredAccount = Account & { user_id: string; auth_user_id: string; pin_hash: string };

// The account behind a number, or E06 (unknown number, recorded in the audit log
// with no user). A deleted account has no phone, so it is unknown too.
export async function findAccount(admin: SupabaseClient, phone: string, action: string): Promise<RegisteredAccount> {
  const account = await rpc<Account>(admin, 'auth_lookup', { p_phone: phone });
  if (!account?.user_id || !account.auth_user_id || !account.pin_hash) {
    await rpc(admin, 'auth_audit', { p_user_id: null, p_device_id: null, p_action: `${action}_unknown_number` });
    throw new Reply(appError('E06'));
  }
  return account as RegisteredAccount;
}

// SPEC §6.2 step 1: a frozen account can't log in (E10); a locked one gets E05.
// The PIN lock itself lives in user_credentials and is checked by checkPin.
export function requireLoginAllowed(account: RegisteredAccount): void {
  if (account.status === 'frozen') throw new Reply(appError('E10'));
  if (account.status === 'locked') throw new Reply(appError('E05'));
  if (account.locked_until && new Date(account.locked_until) > new Date()) {
    throw new Reply(appError('E05', { locked_until: account.locked_until }));
  }
}

// Checks a PIN under the lockout rules. The attempt is counted BEFORE the hash is
// checked, so parallel guesses can't get past the limit. Wrong PIN: E04 with
// attempts_left, or E05 with locked_until when this was the 3rd.
// sessionId: the PIN was asked for inside a live session (Change PIN, Enable
// fingerprint). Any E05 then also ends that session, before the reply is sent.
export async function checkPin(
  admin: SupabaseClient,
  account: RegisteredAccount,
  pin: string,
  sessionId?: string,
): Promise<void> {
  const locked = async (lockedUntil: string | null): Promise<never> => {
    if (sessionId) await rpc(admin, 'auth_end_session', { p_auth_session_id: sessionId, p_reason: 'pin_locked' });
    throw new Reply(appError('E05', { locked_until: lockedUntil }));
  };

  const begin = await rpc<{ allowed: boolean; locked_until: string | null }>(admin, 'auth_attempt_begin', {
    p_user_id: account.user_id,
    p_kind: 'pin',
  });
  if (!begin.allowed) return locked(begin.locked_until);

  const correct = await verifySecret('pin', pin, account.pin_hash);

  const end = await rpc<{ attempts_left: number; locked_until: string | null }>(admin, 'auth_attempt_end', {
    p_user_id: account.user_id,
    p_kind: 'pin',
    p_ok: correct,
  });
  if (correct) return;
  if (end.locked_until) return locked(end.locked_until);
  throw new Reply(appError('E04', { attempts_left: end.attempts_left }));
}

// Same text as private.security_text('new_device'), which stores the in-app row.
const NEW_PHONE_ALERT = {
  title: 'New phone logged in to your wallet',
  body: 'Your account was opened on another phone. If this wasn\'t you, tap "This wasn\'t me".',
};

export interface Binding {
  device_id: string;
  is_new: boolean;
  old_device_id: string | null;
  old_push_token: string | null;
}

// Binds the phone that just proved the PIN (or recovery code). A different device
// secret is a new phone (FR-14): the old device is deactivated, and its push token,
// read BEFORE deactivating, gets the "This wasn't me" alert. That alert ignores
// the Notifications setting and never goes to the new phone.
export async function bindDevice(
  admin: SupabaseClient,
  userId: string,
  deviceSecret: string,
  name: unknown,
): Promise<Binding> {
  const binding = await rpc<Binding>(admin, 'auth_bind_device', {
    p_user_id: userId,
    p_device_secret_hash: await sha256(deviceSecret),
    p_device_name: deviceName(name),
  });

  if (binding.is_new && binding.old_device_id) {
    await sendPush(admin, {
      userId,
      deviceId: binding.old_device_id,
      token: binding.old_push_token,
      event: 'new_device',
      ...NEW_PHONE_ALERT,
      categoryId: 'new_device', // the app registers the "This wasn't me" button under this id
    });
  }
  return binding;
}

// The account of a logged-in user (for functions that ask for the PIN again).
export async function accountOf(
  admin: SupabaseClient,
  userId: string,
): Promise<RegisteredAccount & { phone: string }> {
  const { data, error } = await admin.from('app_users').select('phone').eq('id', userId).single();
  if (error || !data?.phone) throw new Reply(appError('E11'));
  return { ...(await findAccount(admin, data.phone, 'session')), phone: data.phone };
}
