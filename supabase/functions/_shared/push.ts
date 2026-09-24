// Expo Push (CLAUDE.md §7.5, SPEC §6.4b).
//
// Every attempt is recorded in audit_logs with the device it was addressed to
// (action 'push', details { event, result }), never the token itself. That is also
// how the tests prove the new-phone alert went to the OLD phone.
//
// A push that fails never fails the request that caused it: the in-app notification
// row is already stored, and the user sees it in Alerts.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.0';
import { rpc } from './http.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TIMEOUT_MS = 5000;

export interface Push {
  userId: string;
  deviceId: string;
  token: string | null;
  event: string; // e.g. 'new_device'
  title: string;
  body: string;
  data?: Record<string, unknown>;
  categoryId?: string; // action buttons the app registered, e.g. "This wasn't me"
}

type Ticket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };

export async function sendPush(admin: SupabaseClient, push: Push): Promise<boolean> {
  let result: 'sent' | 'failed' | 'no_token' = 'no_token';
  let error: string | undefined;

  if (push.token) {
    try {
      const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' };
      // Only needed if "enhanced push security" is turned on for the Expo project.
      const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
      if (accessToken) headers.authorization = `Bearer ${accessToken}`;

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify([
          {
            to: push.token,
            title: push.title,
            body: push.body,
            data: { event: push.event, ...push.data },
            sound: 'default',
            priority: 'high',
            ...(push.categoryId ? { categoryId: push.categoryId } : {}),
          },
        ]),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => null)) as { data?: Ticket[] } | null;
      const ticket = json?.data?.[0];
      if (res.ok && ticket?.status === 'ok') {
        result = 'sent';
      } else {
        result = 'failed';
        error = ticket?.status === 'error' ? (ticket.details?.error ?? 'error') : `HTTP ${res.status}`;
      }
    } catch (e) {
      result = 'failed';
      error = e instanceof DOMException && e.name === 'TimeoutError' ? 'timeout' : 'network';
    }
  }

  try {
    await rpc(admin, 'auth_audit', {
      p_user_id: push.userId,
      p_device_id: push.deviceId,
      p_action: 'push',
      p_details: { event: push.event, result, ...(error ? { error } : {}) },
    });
  } catch (e) {
    console.error(`push audit failed: ${(e as Error).message}`);
  }
  return result === 'sent';
}
