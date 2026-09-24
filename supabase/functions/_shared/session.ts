// Opening and checking sessions (CLAUDE.md §7.4).
//
// Supabase Auth has no "log in as this user" call, so openSession gives the auth
// user a fresh random password (never stored, never sent to the phone), signs in
// with it, and records the new token's session_id in app_sessions. Without that
// row every money function answers E11.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.0';
import type { SupabaseContext } from 'npm:@supabase/server@1.8.0';
import { randomPassword } from './crypto.ts';
import { appError, Reply, rpc } from './http.ts';
import { internalEmail } from './rules.ts';

export type LoginMethod = 'register' | 'pin' | 'biometric' | 'reset';

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number | undefined;
  expires_in: number;
  token_type: string;
}

function publishableKey(): string {
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  const key = keys ? (JSON.parse(keys) as Record<string, string>).default : Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!key) throw new Error('no publishable key in the function environment');
  return key;
}

function claims(accessToken: string): Record<string, unknown> {
  const payload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
}

export async function openSession(
  admin: SupabaseClient,
  login: {
    userId: string;
    deviceId: string;
    authUserId: string;
    phone: string;
    method: LoginMethod;
    password?: string; // registration already knows it
  },
): Promise<SessionTokens> {
  let password = login.password;
  if (!password) {
    password = randomPassword();
    const { error } = await admin.auth.admin.updateUserById(login.authUserId, { password });
    if (error) throw new Error(`set login password failed: ${error.message}`);
  }

  // A throwaway client: the tokens go back to the app and are never stored here.
  const auth = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email: internalEmail(login.phone), password });
  if (error || !data.session) {
    throw new Error(`sign in failed: ${error?.status ?? ''} ${error?.message ?? 'no session'}`);
  }
  const session = data.session;

  await rpc(admin, 'auth_open_session', {
    p_user_id: login.userId,
    p_device_id: login.deviceId,
    p_auth_session_id: claims(session.access_token).session_id,
    p_method: login.method,
  });

  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
  };
}

export interface LiveSession {
  userId: string;
  deviceId: string;
  sessionId: string;
}

// For functions called with a user token: the same rules as transfer_money
// (session open, seen in the last 60 s, account not frozen), else E11 / E10 / E05.
export async function requireSession(ctx: SupabaseContext): Promise<LiveSession> {
  const authUserId = ctx.userClaims?.id;
  const sessionId = ctx.jwtClaims?.session_id;
  if (!authUserId || typeof sessionId !== 'string') throw new Reply(appError('E11'));

  const row = await rpc<{ app_user_id: string; app_device_id: string }>(ctx.supabaseAdmin, 'auth_check_session', {
    p_auth_user_id: authUserId,
    p_session_id: sessionId,
  });
  return { userId: row.app_user_id, deviceId: row.app_device_id, sessionId };
}
