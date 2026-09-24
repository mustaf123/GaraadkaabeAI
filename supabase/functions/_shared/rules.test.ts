// Run with `npm run test:functions:unit` (deno test).
import { assert, assertEquals, assertFalse, assertMatch } from 'jsr:@std/assert@1';
import {
  deviceName,
  isDeviceSecret,
  isPhone,
  isPin,
  isPushToken,
  isWeakPin,
  normalizeRecoveryCode,
  RECOVERY_ALPHABET,
  recoveryCodeFrom,
} from './rules.ts';

Deno.test('TC-03: only 9-digit numbers are phone numbers', () => {
  assert(isPhone('615552046'));
  for (const bad of ['12345', '6155520460', '61555204a', '+252615552046', ' 615552046', 615552046, null]) {
    assertFalse(isPhone(bad), String(bad));
  }
});

Deno.test('PINs are exactly 4 digits', () => {
  assert(isPin('4829'));
  for (const bad of ['482', '48290', '48a9', 4829, null]) assertFalse(isPin(bad), String(bad));
});

Deno.test('TC-05: weak PINs are rejected (FR-05)', () => {
  const phone = '615552046';
  for (const weak of ['0000', '1111', '9999', '1234', '4321', '2046']) {
    assert(isWeakPin(weak, phone), weak);
  }
  for (const ok of ['4829', '1235', '2045', '0123']) assertFalse(isWeakPin(ok, phone), ok);
});

Deno.test('device secrets are 64 lowercase hex characters', () => {
  assert(isDeviceSecret('a'.repeat(64)));
  assertFalse(isDeviceSecret('A'.repeat(64)));
  assertFalse(isDeviceSecret('a'.repeat(63)));
  assertFalse(isDeviceSecret(undefined));
});

Deno.test('push tokens look like Expo push tokens', () => {
  assert(isPushToken('ExponentPushToken[abc123]'));
  assert(isPushToken('ExpoPushToken[abc123]'));
  assertFalse(isPushToken('ExponentPushToken[]'));
  assertFalse(isPushToken('https://example.com'));
});

Deno.test('device names are trimmed and capped', () => {
  assertEquals(deviceName('  Galaxy A14 '), 'Galaxy A14');
  assertEquals(deviceName(''), null);
  assertEquals(deviceName(42), null);
  assertEquals(deviceName('x'.repeat(150))?.length, 100);
});

Deno.test('recovery codes: XXXX-XXXX, unbiased, and read back in any case', () => {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  let i = 0;
  const code = recoveryCodeFrom(() => bytes[i++]);
  assertMatch(code, new RegExp(`^[${RECOVERY_ALPHABET}]{4}-[${RECOVERY_ALPHABET}]{4}$`));

  // Bytes 248..255 would make the first 8 characters more likely, so they are skipped.
  const fixed = [255, 248, 0, 1, 2, 3, 4, 5, 6, 7];
  let j = 0;
  assertEquals(recoveryCodeFrom(() => fixed[j++]), 'ABCD-EFGH');

  assertEquals(normalizeRecoveryCode('abcd-efgh'), 'ABCDEFGH');
  assertEquals(normalizeRecoveryCode(' ABCD EFGH '), 'ABCDEFGH');
  assertEquals(normalizeRecoveryCode('ABCD-EFG0'), null); // 0 is not in the alphabet
  assertEquals(normalizeRecoveryCode('ABCD-EFG'), null);
});
