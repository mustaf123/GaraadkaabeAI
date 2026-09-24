// Shared by the Node test scripts (test-concurrency.mjs, test-functions.mjs).
// They run against the hosted dev project with `node --env-file=.env`.
//
// SUPABASE_SECRET_KEY (server-only, never EXPO_PUBLIC_, never in app code) is used
// only for setup, cleanup and checks. Nothing here ever prints a key.

import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';

export const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const secretKey = process.env.SUPABASE_SECRET_KEY;

export function requireEnv(label) {
  const missing = Object.entries({
    EXPO_PUBLIC_SUPABASE_URL: url,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    console.error(`${label} failed: missing in .env: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// Tokens live in memory only, like in the app.
export const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let adminClient;
export function admin() {
  adminClient ??= createClient(url, secretKey, clientOptions);
  return adminClient;
}

// Error messages are printed, keys never are: remove both key values and anything
// shaped like a Supabase key (sb_secret_…, sb_publishable_…, or a JWT eyJ…).
export function redact(text) {
  let out = String(text);
  for (const key of [secretKey, publishableKey]) {
    if (key) out = out.split(key).join('[key]');
  }
  return out.replace(/\bsb_(secret|publishable)_[A-Za-z0-9_-]+/g, '[key]').replace(/\beyJ[A-Za-z0-9_.-]+/g, '[key]');
}

// Test numbers are 699xxxxxx.
export function randomPhone() {
  return `699${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
}

export function jwtClaims(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

// Marks a test account deleted and removes its login, like account-delete does, but
// without the balance rule (ledger rows can't be deleted, so the money stays in the
// deleted wallet and every invariant still holds).
export async function deleteTestUser({ userId, authId, phone }) {
  const db = admin();
  if (!userId && phone) {
    const { data } = await db.from('app_users').select('id, auth_user_id').eq('phone', phone).maybeSingle();
    userId = data?.id;
    authId ??= data?.auth_user_id;
  }
  if (userId) {
    const steps = [
      ['revoke sessions', db.from('app_sessions').update({ revoked: true }).eq('user_id', userId)],
      ['deactivate devices', db.from('devices').update({ is_active: false, push_token: null }).eq('user_id', userId)],
      ['mark deleted', db.from('app_users').update({ status: 'deleted', phone: null }).eq('id', userId)],
    ];
    for (const [what, request] of steps) {
      const { error } = await request;
      if (error) throw new Error(`${what}: ${error.message}`);
    }
  }
  if (authId) {
    const { error } = await db.auth.admin.deleteUser(authId);
    if (error && error.status !== 404) throw new Error(`delete login: ${error.message}`);
  }
}
