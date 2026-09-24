// Edge Function tests (build step 3), against the functions DEPLOYED on the hosted
// dev project. Run with `npm run test:functions` (node --env-file=.env).
// Deploy first: npx supabase functions deploy <name> --use-api
//
// The functions are called exactly like the app will call them: the publishable key
// in the apikey header, plus the user's own token for logged-in functions.
// SUPABASE_SECRET_KEY is used only for setup, cleanup and checks (never printed).
//
// Test data: every account made here is deleted at the end (phone NULL, login
// removed). Ledger and audit rows are insert-only, so they stay in the dev database.
//
// Stops at the first failing check, like npm run test:db.

import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  admin,
  clientOptions,
  deleteTestUser,
  publishableKey,
  randomPhone,
  redact,
  requireEnv,
  url,
} from './lib/test-support.mjs';

requireEnv('test:functions');

class TestFailure extends Error {}

// Accounts to delete at the end, by phone number.
const created = new Set();

function check(label, ok, what) {
  if (!ok) throw new TestFailure(redact(`${label} failed: ${what}`));
}

function show(res) {
  return `HTTP ${res.status} ${JSON.stringify(res.body)}`;
}

// { status, body } of one Edge Function call.
async function call(name, body, { token, apikey = publishableKey, method = 'POST' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (apikey) headers.apikey = apikey;
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // not JSON
  }
  return { status: res.status, body: json };
}

function expectOk(label, res) {
  check(label, res.status === 200, `expected HTTP 200, got ${show(res)}`);
  return res.body;
}

function expectError(label, res, code, status) {
  check(label, res.status === status && res.body?.error === code, `expected HTTP ${status} ${code}, got ${show(res)}`);
  return res.body;
}

function newSecret() {
  return randomBytes(32).toString('hex');
}

// An account made straight through the database functions (the same path
// auth-register uses), for tests that need one before auth-register exists.
async function seedAccount() {
  const phone = randomPhone();
  created.add(phone);
  const db = admin();
  const { data: login, error } = await db.auth.admin.createUser({
    email: `${phone}@users.garaadkaabe.invalid`,
    password: newSecret(),
    email_confirm: true,
  });
  if (error) throw new Error(`create login: ${error.message}`);
  const { error: rpcError } = await db.rpc('auth_register_user', {
    p_auth_user_id: login.user.id,
    p_phone: phone,
    p_pin_hash: 'seeded',
    p_recovery_hash: 'seeded',
    p_device_secret_hash: 'seeded',
    p_device_name: 'test-functions seed',
  });
  if (rpcError) throw new Error(`auth_register_user: ${rpcError.message}`);
  return phone;
}

// The app's own client for a logged-in user: publishable key + the user's token.
function userClient(accessToken) {
  return createClient(url, publishableKey, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// Registers through auth-register, like the app. Returns everything a later test needs.
async function register(label, { pin = '4829', deviceSecret = newSecret() } = {}) {
  const phone = await unusedPhone();
  created.add(phone);
  const started = Date.now();
  const body = expectOk(label, await call('auth-register', { phone, pin, device_secret: deviceSecret, device_name: 'test-functions' }));
  check(label, body.session?.access_token, `no session: ${JSON.stringify(body)}`);
  return { phone, pin, deviceSecret, session: body.session, recoveryCode: body.recovery_code, ms: Date.now() - started };
}

// Numbers nobody uses (checked, so a leftover account can't make a test flaky).
async function unusedPhone() {
  for (;;) {
    const phone = randomPhone();
    const { data } = await admin().from('app_users').select('id').eq('phone', phone).maybeSingle();
    if (!data) return phone;
  }
}

// ---------------------------------------------------------------------------
// Suites, run in this order
// ---------------------------------------------------------------------------

const suites = [];
function suite(name, fn) {
  suites.push({ name, fn });
}

suite('auth-check-phone', async () => {
  expectError('TC-03', await call('auth-check-phone', { phone: '12345' }), 'E01', 400);
  expectError('TC-03', await call('auth-check-phone', { phone: '+252615552046' }), 'E01', 400);

  const unknown = await unusedPhone();
  check('FN-01', expectOk('FN-01', await call('auth-check-phone', { phone: unknown })).registered === false,
    'an unused number is reported as registered');

  const known = await seedAccount();
  check('FN-01', expectOk('FN-01', await call('auth-check-phone', { phone: known })).registered === true,
    'a registered number is reported as new');

  // Only the app's publishable key, only POST.
  const noKey = await call('auth-check-phone', { phone: known }, { apikey: null });
  check('FN-01', noKey.status === 401, `no apikey: expected HTTP 401, got ${show(noKey)}`);
  const badKey = await call('auth-check-phone', { phone: known }, { apikey: 'sb_publishable_not_a_real_key' });
  check('FN-01', badKey.status === 401, `wrong apikey: expected HTTP 401, got ${show(badKey)}`);
  const get = await call('auth-check-phone', null, { method: 'GET' });
  check('FN-01', get.status === 405, `GET: expected HTTP 405, got ${show(get)}`);

  return 'TC-03, FN-01';
});

suite('auth-register', async () => {
  const secret = newSecret();
  const phone = await unusedPhone();
  const attempt = (fields) => call('auth-register', { phone, pin: '4829', device_secret: secret, ...fields });

  expectError('TC-03', await attempt({ phone: '12345' }), 'E01', 400);
  for (const weak of ['1234', '4321', '0000', '7777', phone.slice(-4)]) {
    expectError('TC-05', await attempt({ pin: weak }), 'E03', 400);
  }
  check('FN-02', (await attempt({ pin: '48' })).status === 400, 'a 2-digit PIN was accepted');
  check('FN-02', (await attempt({ device_secret: 'short' })).status === 400, 'a malformed device secret was accepted');
  const { data: none } = await admin().from('app_users').select('id').eq('phone', phone).maybeSingle();
  check('FN-02', !none, 'a rejected registration created an account');

  // TC-07: a new account with $100.00, a recovery code, and a live session.
  const user = await register('TC-07');
  check('TC-07', /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(user.recoveryCode),
    `recovery code ${user.recoveryCode} is not XXXX-XXXX`);
  const app = userClient(user.session.access_token);
  const { data: wallet, error: walletError } = await app.from('wallets').select('balance').single();
  check('TC-07', !walletError && Number(wallet.balance) === 100, `balance is ${wallet?.balance ?? walletError?.message}`);

  // Only hashes are stored: bcrypt for the PIN and code, SHA-256 for the device secret.
  const db = admin();
  const { data: account } = await db.from('app_users').select('id').eq('phone', user.phone).single();
  const { data: creds } = await db.from('user_credentials').select('pin_hash, recovery_hash').eq('user_id', account.id).single();
  const { data: device } = await db.from('devices').select('device_secret_hash, name').eq('user_id', account.id).single();
  const bcryptCost10 = /^\$2[aby]\$10\$/;
  check('FN-02', bcryptCost10.test(creds.pin_hash) && bcryptCost10.test(creds.recovery_hash),
    'PIN or recovery code not stored as a bcrypt hash');
  check('FN-02', device.device_secret_hash === createHash('sha256').update(user.deviceSecret).digest('hex'),
    'device secret not stored as its SHA-256 hash');

  // FR-09: sending works immediately (this also proves the app_sessions row exists).
  const receiver = await seedAccount();
  const { data: sent, error: sendError } = await app.rpc('transfer_money', {
    p_receiver_phone: receiver,
    p_amount: '1.00',
    p_idempotency_key: randomUUID(),
  });
  check('TC-07', !sendError && Number(sent?.balance_after) === 99, `first send failed: ${sendError?.message}`);

  // A registered number: E18, and no second account.
  expectError('FN-02', await call('auth-register', { phone: user.phone, pin: '5830', device_secret: newSecret() }), 'E18', 409);

  return `TC-03, TC-05, TC-07, FN-02 (register took ${user.ms} ms)`;
});

suite('auth-login', async () => {
  const user = await register('FN-03');
  const db = admin();
  const { data: account } = await db.from('app_users').select('id').eq('phone', user.phone).single();
  const login = (fields = {}) =>
    call('auth-login', { phone: user.phone, pin: user.pin, device_secret: user.deviceSecret, ...fields });
  const creds = async () =>
    (await db.from('user_credentials').select('failed_pin_count, lockout_count, locked_until')
      .eq('user_id', account.id).single()).data;
  const securityAlerts = async () =>
    (await db.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', account.id).eq('kind', 'security')).count;

  expectError('TC-03', await login({ phone: '12345' }), 'E01', 400);
  expectError('FN-03', await login({ phone: await unusedPhone() }), 'E06', 404);
  check('FN-03', (await login({ pin: '48' })).status === 400, 'a 2-digit PIN was accepted');
  check('FN-03', (await login({ device_secret: 'short' })).status === 400, 'a malformed device secret was accepted');

  // Same phone, right PIN: a working session, the older one revoked, and NO alert.
  const first = expectOk('FN-03', await login());
  check('FN-03', first.session?.access_token && first.new_device === false, `unexpected body ${JSON.stringify(first)}`);
  const { error: readError } = await userClient(first.session.access_token)
    .rpc('my_transactions', { p_direction: 'all', p_before_created_at: null, p_before_id: null, p_limit: 5 });
  check('FN-03', !readError, `new session rejected: ${readError?.message}`);
  const { error: oldError } = await userClient(user.session.access_token)
    .rpc('my_transactions', { p_direction: 'all', p_before_created_at: null, p_before_id: null, p_limit: 5 });
  check('FN-03', oldError?.message === 'E11', `the registration session still works (${oldError?.message})`);
  check('FN-03', (await securityAlerts()) === 0, 'a normal login created a security alert');

  // TC-09: 3 wrong PINs -> E04, E04, E05 (30 min). The right PIN is refused while locked.
  check('TC-09', expectError('TC-09', await login({ pin: '5830' }), 'E04', 401).attempts_left === 2, '1st: not 2 left');
  check('TC-09', expectError('TC-09', await login({ pin: '5830' }), 'E04', 401).attempts_left === 1, '2nd: not 1 left');
  const locked = expectError('TC-09', await login({ pin: '5830' }), 'E05', 423);
  const minutes = (Date.parse(locked.locked_until) - Date.now()) / 60_000;
  check('TC-09', minutes > 29 && minutes <= 30.5, `locked for ${minutes.toFixed(1)} min, not 30`);
  expectError('TC-09', await login(), 'E05', 423);
  const { data: status } = await db.from('app_users').select('status').eq('id', account.id).single();
  check('TC-09', status.status === 'active', `a PIN lock changed the status to ${status.status}`);

  // The lock runs out (clock moved): the right PIN works and resets both counters.
  await db.from('user_credentials').update({ locked_until: new Date(Date.now() - 1000).toISOString() })
    .eq('user_id', account.id);
  expectOk('FN-03', await login());
  const reset = await creds();
  check('FN-03', reset.failed_pin_count === 0 && reset.lockout_count === 0 && reset.locked_until === null,
    `counters not reset: ${JSON.stringify(reset)}`);

  // Parallel guesses: 6 wrong PINs at once still lock after 3 counted attempts.
  const burst = await Promise.all(Array.from({ length: 6 }, () => login({ pin: '5830' })));
  check('FN-03', burst.every((r) => ['E04', 'E05'].includes(r.body?.error)), `burst: ${burst.map(show).join(', ')}`);
  check('FN-03', burst.filter((r) => r.body?.error === 'E04').length <= 2, 'more than 2 wrong PINs answered E04');
  const afterBurst = await creds();
  check('FN-03', afterBurst.locked_until && afterBurst.lockout_count === 1, `burst: ${JSON.stringify(afterBurst)}`);
  expectError('FN-03', await login(), 'E05', 423);

  // A frozen account can't log in, even with the right PIN (E10).
  await db.from('user_credentials').update({ failed_pin_count: 0, locked_until: null }).eq('user_id', account.id);
  await db.from('app_users').update({ status: 'frozen' }).eq('id', account.id);
  expectError('FN-03', await login(), 'E10', 403);
  await db.from('app_users').update({ status: 'active' }).eq('id', account.id);
  expectOk('FN-03', await login());

  return 'TC-03, TC-09, FN-03';
});

suite('new-device + freeze', async () => {
  const user = await register('TC-08');
  const db = admin();
  const { data: account } = await db.from('app_users').select('id').eq('phone', user.phone).single();
  const { data: phoneA } = await db.from('devices').select('id').eq('user_id', account.id).eq('is_active', true).single();
  // Phone A's push token, as device-register-push would have saved it.
  const tokenA = `ExponentPushToken[garaad-test-${randomBytes(6).toString('hex')}]`;
  await db.from('devices').update({ push_token: tokenA }).eq('id', phoneA.id);
  // The alert ignores the Notifications setting (security alerts always go out).
  await db.from('app_users').update({ notifications_on: false }).eq('id', account.id);

  // TC-08: phone B, same PIN -> logged in, phone A deactivated and alerted.
  const secretB = newSecret();
  const b = expectOk('TC-08', await call('auth-login', { phone: user.phone, pin: user.pin, device_secret: secretB }));
  check('TC-08', b.new_device === true, 'phone B not reported as a new device');
  const { data: devices } = await db.from('devices').select('id, is_active, replaced_at, device_secret_hash')
    .eq('user_id', account.id);
  const oldRow = devices.find((d) => d.id === phoneA.id);
  const newRow = devices.find((d) => d.id !== phoneA.id);
  check('TC-08', !oldRow.is_active && oldRow.replaced_at, 'phone A still active');
  check('TC-08', newRow?.is_active && newRow.device_secret_hash === createHash('sha256').update(secretB).digest('hex'),
    'phone B not bound');

  // TC-39 (server side): the alert went to phone A's device, never to phone B's.
  const { data: pushes } = await db.from('audit_logs').select('device_id, details')
    .eq('user_id', account.id).eq('action', 'push');
  check('TC-39', pushes.length === 1 && pushes[0].device_id === phoneA.id && pushes[0].details.event === 'new_device'
    && ['sent', 'failed'].includes(pushes[0].details.result), `pushes: ${JSON.stringify(pushes)}`);
  const { data: alerts } = await db.from('notifications').select('title').eq('user_id', account.id).eq('kind', 'security');
  check('TC-08', alerts.length === 1 && alerts[0].title === 'New phone logged in to your wallet',
    `alerts: ${JSON.stringify(alerts)}`);

  // FR-14: sending works immediately on phone B.
  const receiver = await seedAccount();
  const { error: sendError } = await userClient(b.session.access_token).rpc('transfer_money', {
    p_receiver_phone: receiver, p_amount: '1.00', p_idempotency_key: randomUUID(),
  });
  check('TC-08', !sendError, `send from phone B failed: ${sendError?.message}`);

  // "This wasn't me" is refused from anything but phone A within 7 days.
  const freeze = (fields) => call('account-freeze', { phone: user.phone, device_secret: user.deviceSecret, ...fields });
  expectError('FN-04', await freeze({ phone: '12345' }), 'E01', 400);
  check('FN-04', (await freeze({ device_secret: secretB })).status === 403, 'the active phone B could freeze');
  check('FN-04', (await freeze({ device_secret: newSecret() })).status === 403, 'an unknown device could freeze');
  check('FN-04', (await freeze({ phone: receiver })).status === 403, 'phone A could freeze another account');
  await db.from('devices').update({ replaced_at: new Date(Date.now() - 8 * 86_400_000).toISOString() }).eq('id', phoneA.id);
  check('FN-04', (await freeze()).status === 403, 'phone A could freeze after 8 days');
  await db.from('devices').update({ replaced_at: new Date().toISOString() }).eq('id', phoneA.id);
  const { data: stillActive } = await db.from('app_users').select('status').eq('id', account.id).single();
  check('FN-04', stillActive.status === 'active', 'a refused freeze changed the status');

  // TC-26: phone A taps "This wasn't me" -> frozen, phone B's session ends, login gives E10.
  expectOk('TC-26', await freeze());
  expectOk('TC-26', await freeze()); // twice is fine
  const { data: frozen } = await db.from('app_users').select('status').eq('id', account.id).single();
  check('TC-26', frozen.status === 'frozen', `status is ${frozen.status}`);
  const { error: afterFreeze } = await userClient(b.session.access_token).rpc('transfer_money', {
    p_receiver_phone: receiver, p_amount: '1.00', p_idempotency_key: randomUUID(),
  });
  check('TC-26', ['E10', 'E11'].includes(afterFreeze?.message), `phone B could still send (${afterFreeze?.message})`);
  expectError('TC-26', await call('auth-login', { phone: user.phone, pin: user.pin, device_secret: secretB }), 'E10', 403);
  const { count: frozenAlerts } = await db.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', account.id).eq('kind', 'security').eq('title', 'Account frozen');
  check('TC-26', frozenAlerts === 1, `${frozenAlerts} "Account frozen" alerts`);

  return 'TC-08, TC-26, TC-39 (server), FN-04';
});

suite('biometric', async () => {
  const user = await register('FN-05');
  const db = admin();
  const { data: account } = await db.from('app_users').select('id').eq('phone', user.phone).single();
  const alerts = async (title) =>
    (await db.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', account.id).eq('kind', 'security').eq('title', title)).count;
  const bioSecret = newSecret();
  const bioLogin = (fields = {}) => call('auth-biometric-login',
    { phone: user.phone, biometric_secret: bioSecret, device_secret: user.deviceSecret, ...fields });
  let token = user.session.access_token;

  // Logged-in functions need a user token.
  check('FN-05', (await call('auth-enable-biometric', { pin: user.pin, biometric_secret: bioSecret })).status === 401,
    'enable-biometric worked without a token');
  expectError('FN-05', await bioLogin(), 'E13', 401); // not enabled yet

  // Turning it on needs the PIN; a wrong one counts toward the lockout.
  const wrong = expectError('FN-05', await call('auth-enable-biometric', { pin: '5830', biometric_secret: bioSecret }, { token }),
    'E04', 401);
  check('FN-05', wrong.attempts_left === 2, `attempts_left ${wrong.attempts_left}`);
  expectOk('FN-05', await call('auth-enable-biometric', { pin: user.pin, biometric_secret: bioSecret }, { token }));
  const { data: device } = await db.from('devices').select('biometric_secret_hash').eq('user_id', account.id)
    .eq('is_active', true).single();
  check('FN-05', device.biometric_secret_hash === createHash('sha256').update(bioSecret).digest('hex'),
    'biometric secret not stored as its SHA-256 hash');
  check('FN-05', (await alerts('Fingerprint login turned on')) === 1, 'no "turned on" alert');

  // TC-28: fingerprint login gives a working session and resets the PIN counters.
  await db.from('user_credentials').update({ failed_pin_count: 2, lockout_count: 1 }).eq('user_id', account.id);
  const bio = expectOk('TC-28', await bioLogin());
  token = bio.session.access_token;
  const { error: readError } = await userClient(token)
    .rpc('my_transactions', { p_direction: 'all', p_before_created_at: null, p_before_id: null, p_limit: 5 });
  check('TC-28', !readError, `fingerprint session rejected: ${readError?.message}`);
  const { data: creds } = await db.from('user_credentials').select('failed_pin_count, lockout_count')
    .eq('user_id', account.id).single();
  check('TC-28', creds.failed_pin_count === 0 && creds.lockout_count === 0, `counters not reset: ${JSON.stringify(creds)}`);
  check('FN-05', (await alerts('New phone logged in to your wallet')) === 0, 'a fingerprint login created an alert');

  // Wrong secret, other phone, unknown number, locked, frozen.
  expectError('FN-05', await bioLogin({ biometric_secret: newSecret() }), 'E13', 401);
  expectError('FN-05', await bioLogin({ device_secret: newSecret() }), 'E13', 401);
  expectError('FN-05', await bioLogin({ phone: await unusedPhone() }), 'E06', 404);
  const until = new Date(Date.now() + 30 * 60_000).toISOString();
  await db.from('user_credentials').update({ locked_until: until }).eq('user_id', account.id);
  expectError('FN-05', await bioLogin(), 'E05', 423);
  await db.from('user_credentials').update({ locked_until: null }).eq('user_id', account.id);
  await db.from('app_users').update({ status: 'frozen' }).eq('id', account.id);
  expectError('FN-05', await bioLogin(), 'E10', 403);
  await db.from('app_users').update({ status: 'active' }).eq('id', account.id);

  // Turning it off needs only the session; fingerprint login then stops working.
  token = expectOk('FN-05', await bioLogin()).session.access_token;
  expectOk('FN-05', await call('auth-disable-biometric', {}, { token }));
  check('FN-05', (await alerts('Fingerprint login turned off')) === 1, 'no "turned off" alert');
  expectError('FN-05', await bioLogin(), 'E13', 401);

  // 3 wrong PINs while turning it on lock the login AND end this session.
  const enable = (pin) => call('auth-enable-biometric', { pin, biometric_secret: newSecret() }, { token });
  expectError('FN-05', await enable('5830'), 'E04', 401);
  expectError('FN-05', await enable('5830'), 'E04', 401);
  expectError('FN-05', await enable('5830'), 'E05', 423);
  const receiver = await seedAccount();
  const { error: afterLock } = await userClient(token).rpc('transfer_money', {
    p_receiver_phone: receiver, p_amount: '1.00', p_idempotency_key: randomUUID(),
  });
  check('FN-05', afterLock?.message === 'E11', `the session still sends money after the lock (${afterLock?.message})`);
  expectError('FN-05', await enable(user.pin), 'E11', 401);
  expectError('FN-05', await call('auth-login', { phone: user.phone, pin: user.pin, device_secret: user.deviceSecret }),
    'E05', 423);

  return 'TC-28, FN-05';
});

suite('auth-reset-pin', async () => {
  const user = await register('TC-25');
  const db = admin();
  const { data: account } = await db.from('app_users').select('id').eq('phone', user.phone).single();
  const reset = (fields = {}) => call('auth-reset-pin', {
    phone: user.phone, recovery_code: user.recoveryCode, new_pin: '5830', device_secret: user.deviceSecret, ...fields,
  });
  const login = (pin, deviceSecret = user.deviceSecret) =>
    call('auth-login', { phone: user.phone, pin, device_secret: deviceSecret });

  expectError('TC-03', await reset({ phone: '12345' }), 'E01', 400);
  expectError('FN-06', await reset({ phone: await unusedPhone() }), 'E06', 404);
  check('FN-06', (await reset({ recovery_code: 'ABC' })).status === 400, 'a malformed code was accepted');
  expectError('TC-05', await reset({ new_pin: '1234' }), 'E03', 400);
  const { data: untouched } = await db.from('user_credentials').select('recovery_failed_count')
    .eq('user_id', account.id).single();
  check('FN-06', untouched.recovery_failed_count === 0, 'a weak new PIN used up a recovery attempt');

  // The account is PIN-locked and frozen: the recovery code still works and clears both.
  await db.from('user_credentials').update({ failed_pin_count: 3, lockout_count: 2,
    locked_until: new Date(Date.now() + 30 * 60_000).toISOString() }).eq('user_id', account.id);
  await db.from('app_users').update({ status: 'frozen' }).eq('id', account.id);

  check('FN-06', expectError('FN-06', await reset({ recovery_code: 'ZZZZ-ZZZZ' }), 'E16', 401).attempts_left === 2,
    'wrong code: not 2 attempts left');

  // TC-25: the right code (any case, no dash) -> new PIN, new code, logged in.
  const done = expectOk('TC-25', await reset({ recovery_code: user.recoveryCode.toLowerCase().replace('-', '') }));
  check('TC-25', done.session?.access_token && done.new_device === false, `unexpected body ${JSON.stringify(done)}`);
  check('TC-25', /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(done.recovery_code) && done.recovery_code !== user.recoveryCode,
    'no new recovery code');
  const { data: after } = await db.from('user_credentials')
    .select('failed_pin_count, lockout_count, locked_until, recovery_failed_count').eq('user_id', account.id).single();
  check('FN-06', after.failed_pin_count === 0 && after.lockout_count === 0 && after.locked_until === null
    && after.recovery_failed_count === 0, `locks not cleared: ${JSON.stringify(after)}`);
  const { data: status } = await db.from('app_users').select('status').eq('id', account.id).single();
  check('FN-06', status.status === 'active', `still ${status.status}`);
  const { count: resetAlerts } = await db.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', account.id).eq('kind', 'security').eq('title', 'PIN reset');
  check('FN-06', resetAlerts === 1, `${resetAlerts} "PIN reset" alerts`);
  const { error: oldSession } = await userClient(user.session.access_token)
    .rpc('my_transactions', { p_direction: 'all', p_before_created_at: null, p_before_id: null, p_limit: 5 });
  check('FN-06', oldSession?.message === 'E11', `an earlier session still works (${oldSession?.message})`);

  // The new PIN works, the old one doesn't; the old code is dead, the new one works.
  expectOk('TC-25', await login('5830'));
  expectError('TC-25', await login(user.pin), 'E04', 401);
  expectOk('TC-25', await login('5830')); // resets the fail count again
  expectError('TC-25', await reset({ recovery_code: user.recoveryCode, new_pin: '6941' }), 'E16', 401);

  // TC-39 via Forgot PIN: the reset is done on a DIFFERENT phone (B). New-device flow:
  // phone A (with a push token, Notifications off) gets the "This wasn't me" push,
  // phone B gets none.
  const { data: phoneA } = await db.from('devices').select('id').eq('user_id', account.id).eq('is_active', true).single();
  const tokenA = `ExponentPushToken[garaad-test-${randomBytes(6).toString('hex')}]`;
  await db.from('devices').update({ push_token: tokenA }).eq('id', phoneA.id);
  await db.from('app_users').update({ notifications_on: false }).eq('id', account.id);
  const secretB = newSecret();
  const onB = expectOk('TC-39', await reset({ recovery_code: done.recovery_code, new_pin: '6941', device_secret: secretB }));
  check('TC-39', onB.new_device === true && onB.session?.access_token, 'reset on phone B not treated as a new phone');
  const { data: devices } = await db.from('devices').select('id, is_active, replaced_at').eq('user_id', account.id);
  const oldRow = devices.find((d) => d.id === phoneA.id);
  const phoneB = devices.find((d) => d.is_active);
  check('TC-39', !oldRow.is_active && oldRow.replaced_at && phoneB && phoneB.id !== phoneA.id, 'phone A still active');
  const { data: pushes } = await db.from('audit_logs').select('device_id, details').eq('user_id', account.id)
    .eq('action', 'push');
  check('TC-39', pushes.length === 1 && pushes[0].device_id === phoneA.id && pushes[0].details.event === 'new_device'
    && ['sent', 'failed'].includes(pushes[0].details.result), `pushes: ${JSON.stringify(pushes)}`);
  const { count: newPhoneAlerts } = await db.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', account.id).eq('kind', 'security').eq('title', 'New phone logged in to your wallet');
  check('TC-39', newPhoneAlerts === 1, `${newPhoneAlerts} "New phone" alerts`);

  // 3 wrong codes lock recovery for 24 h (E17), even for the right code.
  expectError('FN-06', await reset({ recovery_code: 'ZZZZ-ZZZZ', device_secret: secretB }), 'E16', 401);
  expectError('FN-06', await reset({ recovery_code: 'ZZZZ-ZZZZ', device_secret: secretB }), 'E16', 401);
  const locked = expectError('FN-06', await reset({ recovery_code: 'ZZZZ-ZZZZ', device_secret: secretB }), 'E17', 423);
  const hours = (Date.parse(locked.locked_until) - Date.now()) / 3_600_000;
  check('FN-06', hours > 23.9 && hours <= 24.1, `recovery locked for ${hours.toFixed(2)} h, not 24`);
  expectError('FN-06', await reset({ recovery_code: onB.recovery_code, device_secret: secretB }), 'E17', 423);

  // Phone A taps "This wasn't me" after the reset on phone B: the account is frozen.
  expectOk('TC-39', await call('account-freeze', { phone: user.phone, device_secret: user.deviceSecret }));
  const { data: frozen } = await db.from('app_users').select('status').eq('id', account.id).single();
  check('TC-39', frozen.status === 'frozen', `status is ${frozen.status}`);

  return 'TC-03, TC-05, TC-25, TC-39 (reset on phone B), FN-06';
});

suite('auth-change-pin', async () => {
  const user = await register('FN-07');
  const db = admin();
  const { data: account } = await db.from('app_users').select('id').eq('phone', user.phone).single();
  const token = user.session.access_token;
  const change = (fields, t = token) => call('auth-change-pin', { current_pin: user.pin, new_pin: '5830', ...fields }, { token: t });
  const login = (pin) => call('auth-login', { phone: user.phone, pin, device_secret: user.deviceSecret });

  check('FN-07', (await change({}, null)).status === 401, 'change-pin worked without a token');
  expectError('TC-05', await change({ new_pin: user.phone.slice(-4) }), 'E03', 400);
  const { data: fresh } = await db.from('user_credentials').select('failed_pin_count').eq('user_id', account.id).single();
  check('FN-07', fresh.failed_pin_count === 0, 'a weak new PIN used up a PIN attempt');

  // TC-35: a wrong current PIN is rejected and counts toward the lockout.
  check('TC-35', expectError('TC-35', await change({ current_pin: '9175' }), 'E04', 401).attempts_left === 2,
    'not 2 attempts left');
  const { data: counted } = await db.from('user_credentials').select('failed_pin_count').eq('user_id', account.id).single();
  check('TC-35', counted.failed_pin_count === 1, `failed_pin_count ${counted.failed_pin_count}`);

  // The right current PIN: the new PIN works at login, the old one doesn't.
  expectOk('FN-07', await change({}));
  const { count: changed } = await db.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', account.id).eq('kind', 'security').eq('title', 'PIN changed');
  check('FN-07', changed === 1, `${changed} "PIN changed" alerts`);
  expectError('FN-07', await login(user.pin), 'E04', 401);
  const relog = expectOk('FN-07', await login('5830'));

  // 3 wrong current PINs lock the login too (E05), even for the right PIN, and end
  // this session: the phone that was guessing can't keep sending money.
  const t2 = relog.session.access_token;
  const pushToken = `ExponentPushToken[garaad-test-${randomBytes(6).toString('hex')}]`;
  expectOk('FN-07', await call('device-register-push', { push_token: pushToken }, { token: t2 }));
  const receiver = await seedAccount();
  const send = (t) => userClient(t).rpc('transfer_money', {
    p_receiver_phone: receiver, p_amount: '1.00', p_idempotency_key: randomUUID(),
  });
  expectError('TC-35', await change({ current_pin: '9175', new_pin: '6941' }, t2), 'E04', 401);
  expectError('TC-35', await change({ current_pin: '9175', new_pin: '6941' }, t2), 'E04', 401);
  expectError('TC-35', await change({ current_pin: '9175', new_pin: '6941' }, t2), 'E05', 423);
  const { error: afterLock } = await send(t2);
  check('FN-07', afterLock?.message === 'E11', `the session still sends money after the lock (${afterLock?.message})`);
  expectError('FN-07', await change({ new_pin: '6941' }, t2), 'E11', 401);
  const { data: device } = await db.from('devices').select('push_token').eq('user_id', account.id).eq('is_active', true)
    .single();
  check('FN-07', device.push_token === pushToken, 'the lock logout cleared the push token (only Log out may)');
  expectError('TC-35', await login('5830'), 'E05', 423);

  // Already locked (e.g. by wrong PINs at login on another phone): E05 ends this session too.
  await db.from('user_credentials').update({ failed_pin_count: 0, locked_until: null }).eq('user_id', account.id);
  const t3 = expectOk('FN-07', await login('5830')).session.access_token;
  await db.from('user_credentials').update({ locked_until: new Date(Date.now() + 30 * 60_000).toISOString() })
    .eq('user_id', account.id);
  expectError('FN-07', await change({ current_pin: '5830', new_pin: '6941' }, t3), 'E05', 423);
  const { error: afterLocked } = await send(t3);
  check('FN-07', afterLocked?.message === 'E11', `the session still sends money while locked (${afterLocked?.message})`);
  const { count: ended } = await db.from('audit_logs').select('id', { count: 'exact', head: true })
    .eq('user_id', account.id).eq('action', 'session_ended');
  check('FN-07', ended === 2, `${ended} "session_ended" audit rows, expected 2`);

  return 'TC-05, TC-35, FN-07';
});

suite('push token + logout', async () => {
  const user = await register('FN-08');
  const other = await register('FN-08');
  const db = admin();
  const pushTokenOf = async (phone) => {
    const { data: acc } = await db.from('app_users').select('id').eq('phone', phone).single();
    const { data } = await db.from('devices').select('push_token').eq('user_id', acc.id).eq('is_active', true).single();
    return data.push_token;
  };
  const token = `ExponentPushToken[garaad-test-${randomBytes(6).toString('hex')}]`;

  check('FN-08', (await call('device-register-push', { push_token: token })).status === 401, 'worked without a user token');
  check('FN-08', (await call('device-register-push', { push_token: 'https://example.com' },
    { token: user.session.access_token })).status === 400, 'a non-Expo push token was accepted');
  expectOk('FN-08', await call('device-register-push', { push_token: token }, { token: user.session.access_token }));
  check('FN-08', (await pushTokenOf(user.phone)) === token, 'push token not saved on the device');

  // The same phone now used by another account: the token moves, never on two accounts.
  expectOk('FN-08', await call('device-register-push', { push_token: token }, { token: other.session.access_token }));
  check('FN-08', (await pushTokenOf(user.phone)) === null && (await pushTokenOf(other.phone)) === token,
    'push token on two accounts');

  // An idle session keeps its push token (only Log out clears it).
  const { data: otherAcc } = await db.from('app_users').select('id').eq('phone', other.phone).single();
  await db.from('app_sessions').update({ last_seen: new Date(Date.now() - 61_000).toISOString() }).eq('user_id', otherAcc.id);
  expectError('TC-24', await call('device-register-push', { push_token: token }, { token: other.session.access_token }),
    'E11', 401);
  check('FN-08', (await pushTokenOf(other.phone)) === token, 'an idle timeout cleared the push token');

  // Log out works even after the idle timeout: session revoked, push token cleared.
  expectOk('FN-08', await call('auth-logout', {}, { token: other.session.access_token }));
  check('FN-08', (await pushTokenOf(other.phone)) === null, 'Log out kept the push token');
  const { data: sessions } = await db.from('app_sessions').select('revoked').eq('user_id', otherAcc.id);
  check('FN-08', sessions.every((s) => s.revoked), 'a session is still open after Log out');

  // A live session logs out too, and its token no longer works anywhere.
  expectOk('FN-08', await call('auth-logout', {}, { token: user.session.access_token }));
  const { error } = await userClient(user.session.access_token)
    .rpc('my_transactions', { p_direction: 'all', p_before_created_at: null, p_before_id: null, p_limit: 5 });
  check('FN-08', error, 'the token still works after Log out');
  check('FN-08', (await call('auth-logout', {})).status === 401, 'logout worked without a user token');

  return 'TC-24, FN-08';
});

suite('account-delete', async () => {
  const user = await register('TC-33');
  const db = admin();
  const { data: before } = await db.from('app_users').select('id, auth_user_id').eq('phone', user.phone).single();
  const token = user.session.access_token;

  check('TC-33', (await call('account-delete', {})).status === 401, 'delete worked without a user token');

  // TC-33: balance $100.00 -> refused, nothing changes.
  expectError('TC-33', await call('account-delete', {}, { token }), 'E14', 409);
  const { data: still } = await db.from('app_users').select('status, phone').eq('id', before.id).single();
  check('TC-33', still.status === 'active' && still.phone === user.phone, 'a refused delete changed the account');

  // Send everything out, then delete (TC-34).
  const receiver = await seedAccount();
  const { error: sendError } = await userClient(token).rpc('transfer_money', {
    p_receiver_phone: receiver, p_amount: '100.00', p_idempotency_key: randomUUID(),
  });
  check('TC-34', !sendError, `emptying the wallet failed: ${sendError?.message}`);
  await db.from('devices').update({ push_token: `ExponentPushToken[garaad-test-${randomBytes(6).toString('hex')}]` })
    .eq('user_id', before.id);
  expectOk('TC-34', await call('account-delete', {}, { token }));

  const { data: gone } = await db.from('app_users').select('status, phone, auth_user_id').eq('id', before.id).single();
  check('TC-34', gone.status === 'deleted' && gone.phone === null && gone.auth_user_id === null,
    `row after delete: ${JSON.stringify(gone)}`);
  const { data: devices } = await db.from('devices').select('is_active, push_token').eq('user_id', before.id);
  check('TC-34', devices.every((d) => !d.is_active && d.push_token === null), 'a device is still active or has a push token');
  const { data: login } = await db.auth.admin.getUserById(before.auth_user_id);
  check('TC-34', !login?.user, 'the Supabase auth user still exists');

  // Signed out, the old PIN no longer logs in, and the number is free again.
  const { error: readError } = await userClient(token)
    .rpc('my_transactions', { p_direction: 'all', p_before_created_at: null, p_before_id: null, p_limit: 5 });
  check('TC-34', readError, 'the token still works after delete');
  expectError('TC-34', await call('auth-login', { phone: user.phone, pin: user.pin, device_secret: user.deviceSecret }),
    'E06', 404);
  check('TC-34', expectOk('TC-34', await call('auth-check-phone', { phone: user.phone })).registered === false,
    'the number is still registered');
  const again = expectOk('TC-34', await call('auth-register',
    { phone: user.phone, pin: '5830', device_secret: newSecret(), device_name: 'test-functions' }));
  const { data: fresh } = await db.from('app_users').select('id').eq('phone', user.phone).single();
  const { data: wallet } = await userClient(again.session.access_token).from('wallets').select('balance').single();
  check('TC-34', fresh.id !== before.id && Number(wallet.balance) === 100, 'the number did not register as a new account');

  return 'TC-33, TC-34';
});

// ---------------------------------------------------------------------------

async function main() {
  const only = process.argv[2];
  try {
    for (const { name, fn } of suites) {
      if (only && name !== only) continue;
      const labels = await fn();
      console.log(`ok    ${name.padEnd(22)} ${labels}`);
    }
    console.log('\nAll Edge Function tests passed.');
  } catch (error) {
    console.error(error instanceof TestFailure ? `FAIL  ${error.message}` : redact(`FAIL  ${error.stack}`));
    process.exitCode = 1;
  } finally {
    let cleaned = 0;
    for (const phone of created) {
      try {
        await deleteTestUser({ phone });
        cleaned++;
      } catch (error) {
        console.error(redact(`cleanup of test user ${phone} failed: ${error.message}`));
      }
    }
    console.log(`cleanup ${cleaned} test accounts deleted`);
  }
}

await main();
