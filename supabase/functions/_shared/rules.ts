// Input rules shared by the auth Edge Functions (SPEC.md FR-02, FR-05, FR-06).
// No imports and no I/O, so `deno test` can check them directly.

// 9 digits after +252, e.g. 615552046 (FR-02).
export function isPhone(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{9}$/.test(value);
}

export function isPin(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{4}$/.test(value);
}

// FR-05: the same digit four times, 1234, 4321, or the last 4 digits of the user's own number.
export function isWeakPin(pin: string, phone: string): boolean {
  return /^(\d)\1{3}$/.test(pin) || pin === '1234' || pin === '4321' || pin === phone.slice(-4);
}

// Device and biometric secrets: 32 random bytes, sent as 64 lowercase hex characters.
export function isDeviceSecret(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

// Expo push token, e.g. ExponentPushToken[xxxxxxxx].
export function isPushToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && /^Expo(nent)?PushToken\[[^\]\s]+\]$/.test(value);
}

// Optional device name ("Galaxy A14"): trimmed, at most 100 characters.
export function deviceName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().slice(0, 100);
  return name === '' ? null : name;
}

// Recovery codes (FR-06): XXXX-XXXX from 31 characters that can't be mistaken for
// each other (no 0/O, 1/I/L). 31^8 ≈ 8.5 × 10^11 codes.
export const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Builds a code from random bytes. Bytes >= 248 are skipped so every character is
// equally likely (248 = 8 × 31); `nextByte` supplies more random bytes as needed.
export function recoveryCodeFrom(nextByte: () => number): string {
  let code = '';
  while (code.length < 8) {
    const byte = nextByte();
    if (byte < 248) code += RECOVERY_ALPHABET[byte % 31];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// What the user typed -> the 8 characters that get hashed, or null if it can't be a
// code. Lower case, spaces and the dash are accepted.
export function normalizeRecoveryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== 8) return null;
  for (const char of code) {
    if (!RECOVERY_ALPHABET.includes(char)) return null;
  }
  return code;
}

// The Supabase auth user behind a phone number (never shown to anyone).
export function internalEmail(phone: string): string {
  return `${phone}@users.garaadkaabe.invalid`;
}
