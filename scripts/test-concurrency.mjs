// TC-17: two $8 sends at the same moment from a $10 wallet -> exactly one succeeds.
// This needs two parallel connections, so it can't be a SQL test file.
//
// Run with `npm run test:concurrency` (node --env-file=.env). It uses the hosted dev project.
//
// Keys:
// - SUPABASE_SECRET_KEY (server-only, never EXPO_PUBLIC_, never in app code) is used
//   ONLY for setup and cleanup: creating test logins, writing the server-only rows
//   (app_users, user_credentials, devices, wallets, app_sessions) and paying the
//   welcome bonus.
// - The sends themselves use the publishable key + each test user's own login token,
//   exactly like the app: PostgREST -> RLS/grants -> transfer_money.
//
// Test data: ledger and audit rows are insert-only, so each run leaves ~25 transactions
// in the dev database. The test users are then deleted (phone NULL, login removed).

import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';

const ROUNDS = 10;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey) {
  const missing = Object.entries({
    EXPO_PUBLIC_SUPABASE_URL: url,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  console.error(`TC-17 failed: missing in .env: ${missing.join(', ')}`);
  process.exit(1);
}

// Tokens live in memory only, like in the app.
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, secretKey, clientOptions);

class TestFailure extends Error {}

// Error messages are printed, keys never are: remove both key values and anything
// shaped like a Supabase key (sb_secret_…, sb_publishable_…, or a JWT eyJ…).
function redact(text) {
  let out = String(text);
  for (const key of [secretKey, publishableKey]) out = out.split(key).join('[key]');
  return out.replace(/\bsb_(secret|publishable)_[A-Za-z0-9_-]+/g, '[key]').replace(/\beyJ[A-Za-z0-9_.-]+/g, '[key]');
}

function fail(message) {
  throw new TestFailure(redact(`TC-17 failed: ${message}`));
}

async function must(what, request) {
  const { data, error } = await request;
  if (error) fail(`${what}: ${error.message}`);
  return data;
}

function jwtClaims(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

// A test user registered the way auth-register will do it (build step 3),
// logged in with the publishable key, with a live app_sessions row.
async function createTestUser(created) {
  let phone;
  let authId;
  let lastError;
  const password = randomBytes(24).toString('base64url');

  // Retries only cover a random number that is already taken.
  for (let attempt = 0; attempt < 5 && !authId; attempt++) {
    phone = `699${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `${phone}@users.garaadkaabe.invalid`,
      password,
      email_confirm: true,
    });
    if (error) lastError = error;
    else authId = data.user.id;
  }
  if (!authId) {
    fail(`could not create a test login: ${lastError.message} (HTTP ${lastError.status ?? '?'})`);
  }

  const user = { phone, authId, userId: null, client: null };
  created.push(user);

  const appUser = await must('insert app_users',
    admin.from('app_users').insert({ auth_user_id: authId, phone }).select('id').single());
  user.userId = appUser.id;

  await must('insert user_credentials',
    admin.from('user_credentials').insert({ user_id: user.userId, pin_hash: 'tc17-test', recovery_hash: 'tc17-test' }));
  const device = await must('insert devices',
    admin.from('devices')
      .insert({ user_id: user.userId, device_secret_hash: 'tc17-test', name: 'TC-17 script' })
      .select('id')
      .single());
  await must('insert wallets', admin.from('wallets').insert({ user_id: user.userId, type: 'user' }));

  user.client = createClient(url, publishableKey, clientOptions);
  const login = await must('sign in',
    user.client.auth.signInWithPassword({ email: `${phone}@users.garaadkaabe.invalid`, password }));
  const sessionId = jwtClaims(login.session.access_token).session_id;
  await must('insert app_sessions',
    admin.from('app_sessions').insert({ user_id: user.userId, device_id: device.id, auth_session_id: sessionId }));

  return user;
}

function trySend(user, receiverPhone, amount, key = randomUUID()) {
  return user.client.rpc('transfer_money', {
    p_receiver_phone: receiverPhone,
    p_amount: amount,
    p_idempotency_key: key,
  });
}

async function send(user, receiverPhone, amount) {
  return must(`send $${amount}`, trySend(user, receiverPhone, amount));
}

async function balanceOf(user) {
  const wallet = await must('read balance', user.client.from('wallets').select('balance').single());
  return Number(wallet.balance);
}

async function expectBalance(user, expected, when) {
  const balance = await balanceOf(user);
  if (balance !== expected) fail(`${when}: balance is $${balance}, expected $${expected}`);
}

function describe(results) {
  return results.map((r) => (r.error ? r.error.message : `sent ${r.data.reference}`)).join(' + ');
}

async function cleanup(users) {
  for (const user of users) {
    try {
      if (user.userId) {
        await must('revoke sessions', admin.from('app_sessions').update({ revoked: true }).eq('user_id', user.userId));
        await must('deactivate devices',
          admin.from('devices').update({ is_active: false, push_token: null }).eq('user_id', user.userId));
        await must('mark deleted',
          admin.from('app_users').update({ status: 'deleted', phone: null }).eq('id', user.userId));
      }
      if (user.authId) {
        const { error } = await admin.auth.admin.deleteUser(user.authId);
        if (error) throw new Error(`delete login: ${error.message}`);
      }
    } catch (error) {
      console.error(redact(`cleanup of test user ${user.phone} failed: ${error.message}`));
    }
  }
}

async function main() {
  const created = [];
  try {
    const a = await createTestUser(created);
    const b = await createTestUser(created);
    console.log(`setup  test users A ${a.phone}, B ${b.phone}`);

    await must('welcome bonus A', admin.rpc('grant_welcome_bonus', { p_user_id: a.userId }));
    await must('welcome bonus B', admin.rpc('grant_welcome_bonus', { p_user_id: b.userId }));
    await send(a, b.phone, '90');
    await expectBalance(a, 10, 'setup');
    console.log('setup  A has $10.00');

    for (let round = 1; round <= ROUNDS; round++) {
      const results = await Promise.all([trySend(a, b.phone, '8'), trySend(a, b.phone, '8')]);
      const sent = results.filter((r) => !r.error).length;
      const rejected = results.filter((r) => r.error?.message === 'E08').length;
      if (sent !== 1 || rejected !== 1) {
        fail(`round ${round}: expected 1 sent + 1 E08, got ${describe(results)}`);
      }
      await expectBalance(a, 2, `round ${round}`);
      console.log(`ok     round ${String(round).padStart(2)}: two $8 sends at once -> ${describe(results)}; A has $2.00`);

      await send(b, a.phone, '8');
      await expectBalance(a, 10, `round ${round} refill`);
    }

    // Double tap: the same idempotency key twice at the same moment -> one transaction.
    const key = randomUUID();
    const [first, second] = await Promise.all([trySend(a, b.phone, '1', key), trySend(a, b.phone, '1', key)]);
    if (first.error || second.error) {
      fail(`double tap: ${describe([first, second])}`);
    }
    if (first.data.transaction_id !== second.data.transaction_id) {
      fail('double tap: the two responses name different transactions');
    }
    const { count, error } = await admin
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('idempotency_key', key);
    if (error) fail(`count transactions: ${error.message}`);
    if (count !== 1) fail(`double tap: ${count} transactions for one key`);
    await expectBalance(a, 9, 'double tap');
    console.log(`ok     double tap: same key twice at once -> one transaction ${first.data.reference}; A has $9.00`);

    // TC-36 over the whole database, including what this run just wrote.
    const invariants = spawnSync('npx supabase db query --linked -f supabase/tests/06_ledger_invariants.test.sql', {
      encoding: 'utf8',
      shell: true,
    });
    if (invariants.status !== 0) fail('ledger invariants (TC-36) broken after the concurrency run');
    console.log('ok     TC-36: ledger still sums to 0 and every balance matches its ledger');

    console.log('\nTC-17 passed');
  } catch (error) {
    console.error(error instanceof TestFailure ? error.message : redact(`TC-17 failed: ${error.stack}`));
    process.exitCode = 1;
  } finally {
    await cleanup(created);
    console.log(`cleanup ${created.length} test users marked deleted`);
  }
}

await main();
