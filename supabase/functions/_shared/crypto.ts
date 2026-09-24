// Hashing for the auth Edge Functions (CLAUDE.md §7.4, SPEC.md NFR-02).
// All hashing happens here, on the server; the app sends raw values over HTTPS.
//
// - PIN and recovery code: bcrypt (cost 10) of HMAC-SHA256(PIN_PEPPER, value).
//   bcryptjs is pure JavaScript: the Edge runtime has no Web Workers, which the
//   deno.land bcrypt module needs. The pepper is an Edge Function secret that never
//   reaches the database, so a database leak alone can't be brute-forced.
// - Device and biometric secrets (32 random bytes): SHA-256. They are far too random
//   to guess, and a plain hash can be looked up (account-freeze).

import bcrypt from 'npm:bcryptjs@3.0.3';
import { recoveryCodeFrom } from './rules.ts';

const BCRYPT_COST = 10;
const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

let pepperKey: Promise<CryptoKey> | null = null;

function pepper(): Promise<CryptoKey> {
  if (!pepperKey) {
    const secret = Deno.env.get('PIN_PEPPER');
    if (!secret || secret.length < 32) {
      throw new Error('PIN_PEPPER is not set (npx supabase secrets set PIN_PEPPER=...)');
    }
    pepperKey = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
    ]);
  }
  return pepperKey;
}

// 'pin' and 'recovery' are mixed in so the same value never gives the same input twice.
async function peppered(kind: 'pin' | 'recovery', value: string): Promise<string> {
  return hex(await crypto.subtle.sign('HMAC', await pepper(), encoder.encode(`${kind}:${value}`)));
}

export async function hashSecret(kind: 'pin' | 'recovery', value: string): Promise<string> {
  return bcrypt.hash(await peppered(kind, value), BCRYPT_COST);
}

export async function verifySecret(kind: 'pin' | 'recovery', value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(await peppered(kind, value), hash);
}

export async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

// Constant-time comparison of two hex hashes, so response time doesn't leak how
// many characters matched.
export function sameHash(a: string | null | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function newRecoveryCode(): string {
  const bytes = new Uint8Array(1);
  return recoveryCodeFrom(() => crypto.getRandomValues(bytes)[0]);
}

export function randomPassword(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}
