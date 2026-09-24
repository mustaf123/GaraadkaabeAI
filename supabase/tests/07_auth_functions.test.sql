-- 07: the database side of the auth Edge Functions (*_auth_functions.sql).
-- DB-50..DB-59. The Edge Functions themselves are tested by scripts/test-functions.mjs.
-- Run with `npm run test:db`. Everything runs in one transaction and is rolled back,
-- so now() is the same moment throughout: "61 s ago" is written as now() - 61 s.

begin;

-- ---------------------------------------------------------------------------
-- Test helpers (live in pg_temp, gone after the rollback). They run as the
-- migration owner, which may call every function (the Edge Functions use service_role;
-- DB-50 checks those privileges separately).
-- ---------------------------------------------------------------------------

create function pg_temp.expect_error(p_label text, p_sql text, p_sqlstate text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_sqlstate then
      raise exception '% failed: % -> expected error %, got % (%)', p_label, p_sql, p_sqlstate, sqlstate, sqlerrm;
    end if;
    return;
  end;
  raise exception '% failed: % -> should have been rejected with %, but it succeeded', p_label, p_sql, p_sqlstate;
end $$;

-- Fails unless the statement raises the app error code (message = 'E14' etc.).
create function pg_temp.expect_app_error(p_label text, p_sql text, p_code text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm <> p_code then
      raise exception '% failed: % -> expected %, got % (%)', p_label, p_sql, p_code, sqlerrm, sqlstate;
    end if;
    return;
  end;
  raise exception '% failed: % -> expected %, but it succeeded', p_label, p_sql, p_code;
end $$;

create function pg_temp.check(p_label text, p_ok boolean, p_what text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception '% failed: %', p_label, p_what;
  end if;
end $$;

-- A new account through auth_register_user. Returns the app user id.
create function pg_temp.register(p_auth uuid, p_phone text, p_device_hash text) returns uuid
language plpgsql as $$
declare
  v_user uuid;
begin
  insert into auth.users (id, email) values (p_auth, p_phone || '@users.garaadkaabe.invalid');
  select r.user_id into v_user
  from public.auth_register_user(p_auth, p_phone, 'pin-hash', 'recovery-hash', p_device_hash, 'Test phone') r;
  return v_user;
end $$;

create function pg_temp.uid(p_phone text) returns uuid
language sql as $$ select id from public.app_users where phone = p_phone $$;

create function pg_temp.active_device(p_phone text) returns uuid
language sql as $$
  select d.id from public.devices d join public.app_users u on u.id = d.user_id
  where u.phone = p_phone and d.is_active
$$;

create function pg_temp.creds(p_phone text) returns public.user_credentials
language sql as $$
  select c.* from public.user_credentials c join public.app_users u on u.id = c.user_id where u.phone = p_phone
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
--   A 690000101  auth ...a1   (main test user)
--   B 690000102  auth ...b1   (receiver for emptying A's wallet)
-- ---------------------------------------------------------------------------

select pg_temp.register('00000000-0000-4000-8000-0000000000a1', '690000101', 'device-a1');
select pg_temp.register('00000000-0000-4000-8000-0000000000b1', '690000102', 'device-b1');

-- ---------------------------------------------------------------------------
-- DB-50: only service_role may call the auth functions; the app never can.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.auth_phone_registered(text)', 'public.auth_lookup(text)',
    'public.auth_check_session(uuid, uuid)', 'public.auth_open_session(uuid, uuid, uuid, text)',
    'public.auth_logout(uuid)', 'public.auth_register_user(uuid, text, text, text, text, text)',
    'public.auth_orphan_login(text)', 'public.auth_attempt_begin(uuid, text)',
    'public.auth_attempt_end(uuid, text, boolean)', 'public.auth_bind_device(uuid, text, text)',
    'public.auth_set_push_token(uuid, text)', 'public.auth_set_biometric(uuid, text)',
    'public.auth_set_pin(uuid, text)', 'public.auth_reset_pin(uuid, text, text)',
    'public.auth_freeze(text, text)', 'public.auth_delete_account(uuid)',
    'public.auth_audit(uuid, uuid, text, jsonb)', 'public.auth_end_session(uuid, text)'
  ] loop
    perform pg_temp.check('DB-50', not has_function_privilege('anon', f, 'execute'), 'anon can execute ' || f);
    perform pg_temp.check('DB-50', not has_function_privilege('authenticated', f, 'execute'),
      'authenticated can execute ' || f);
    perform pg_temp.check('DB-50', has_function_privilege('service_role', f, 'execute'),
      'service_role cannot execute ' || f);
  end loop;

  foreach f in array array[
    'private.security_text(text)', 'private.notify_security(uuid, text)',
    'private.require_session_for(uuid, uuid)', 'private.apply_lock(uuid, text)'
  ] loop
    perform pg_temp.check('DB-50', not has_function_privilege('anon', f, 'execute'), 'anon can execute ' || f);
    perform pg_temp.check('DB-50', not has_function_privilege('authenticated', f, 'execute'),
      'authenticated can execute ' || f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- DB-51: registration is complete, pays the bonus, and is all or nothing (TC-07).
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := pg_temp.uid('690000101');
begin
  perform pg_temp.check('DB-51', (select status = 'active' from public.app_users where id = a), 'not active');
  perform pg_temp.check('DB-51', (select pin_hash = 'pin-hash' and failed_pin_count = 0
                                  from public.user_credentials where user_id = a), 'credentials missing');
  perform pg_temp.check('DB-51', (select balance = 100.00 from public.wallets where user_id = a),
    'welcome balance is not $100.00');
  perform pg_temp.check('DB-51', (select count(*) = 1 from public.transactions t
                                  join public.wallets w on w.id = t.receiver_wallet_id
                                  where w.user_id = a and t.type = 'welcome_bonus'), 'no welcome bonus transaction');
  perform pg_temp.check('DB-51', (select count(*) = 1 from public.notifications
                                  where user_id = a and kind = 'welcome'), 'no welcome notification');
  perform pg_temp.check('DB-51', (select count(*) = 1 from public.devices
                                  where user_id = a and is_active and device_secret_hash = 'device-a1'),
    'device not bound');
  perform pg_temp.check('DB-51', (select count(*) = 1 from public.audit_logs where user_id = a and action = 'register'),
    'no audit row');

  -- Lookups used by auth-check-phone and the login functions.
  perform pg_temp.check('DB-51', public.auth_phone_registered('690000101'), 'registered number not found');
  perform pg_temp.check('DB-51', not public.auth_phone_registered('690000199'), 'unknown number found');
  perform pg_temp.check('DB-51', (select l.user_id = a and l.device_secret_hash = 'device-a1' and l.pin_hash = 'pin-hash'
                                  from public.auth_lookup('690000101') l), 'auth_lookup wrong');
  perform pg_temp.check('DB-51', (select l.user_id is null from public.auth_lookup('690000199') l),
    'auth_lookup found an unknown number');

  -- E18: number already registered. E01: bad number.
  insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000c1', 'dup@users.garaadkaabe.invalid');
  perform pg_temp.expect_app_error('DB-51', $q$select public.auth_register_user(
    '00000000-0000-4000-8000-0000000000c1', '690000101', 'h', 'h', 'd', 'n')$q$, 'E18');
  perform pg_temp.expect_app_error('DB-51', $q$select public.auth_register_user(
    '00000000-0000-4000-8000-0000000000c1', '12345', 'h', 'h', 'd', 'n')$q$, 'E01');

  -- A failure half-way (no PIN hash) leaves nothing behind.
  perform pg_temp.expect_error('DB-51', $q$select public.auth_register_user(
    '00000000-0000-4000-8000-0000000000c1', '690000103', null, 'h', 'd', 'n')$q$, '23502');
  perform pg_temp.check('DB-51', not exists (select 1 from public.app_users where phone = '690000103'),
    'half-registered user left behind');
end $$;

-- ---------------------------------------------------------------------------
-- DB-52: PIN and recovery attempts, counted before the check (TC-09, TC-35).
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := pg_temp.uid('690000101');
  b record;
  e record;
begin
  -- Three wrong PINs: 2 left, 1 left, then locked for 30 minutes.
  for i in 1..3 loop
    select * into b from public.auth_attempt_begin(a, 'pin');
    perform pg_temp.check('DB-52', b.allowed, format('attempt %s not allowed', i));
    select * into e from public.auth_attempt_end(a, 'pin', false);
    perform pg_temp.check('DB-52', e.attempts_left = 3 - i, format('attempt %s: %s left', i, e.attempts_left));
  end loop;
  perform pg_temp.check('DB-52', e.locked_until = now() + interval '30 minutes', 'not locked for 30 min');
  perform pg_temp.check('DB-52', (pg_temp.creds('690000101')).lockout_count = 1, 'lockout_count not 1');
  perform pg_temp.check('DB-52', (select status = 'active' from public.app_users where id = a),
    'a PIN lock changed app_users.status');

  -- While locked, no attempt is allowed.
  select * into b from public.auth_attempt_begin(a, 'pin');
  perform pg_temp.check('DB-52', not b.allowed and b.locked_until = now() + interval '30 minutes',
    'attempt allowed while locked');

  -- After the lock runs out, counting starts again.
  update public.user_credentials set locked_until = now() - interval '1 second' where user_id = a;
  select * into b from public.auth_attempt_begin(a, 'pin');
  perform pg_temp.check('DB-52', b.allowed and (pg_temp.creds('690000101')).failed_pin_count = 1,
    'count did not restart after the lock ran out');

  -- A correct PIN resets the fail count and the lockout count.
  select * into e from public.auth_attempt_end(a, 'pin', true);
  perform pg_temp.check('DB-52', (select failed_pin_count = 0 and lockout_count = 0 and locked_until is null
                                  from public.user_credentials where user_id = a), 'success did not reset');

  -- The 3rd lockout lasts 24 hours.
  update public.user_credentials set lockout_count = 2 where user_id = a;
  for i in 1..3 loop
    perform public.auth_attempt_begin(a, 'pin');
    select * into e from public.auth_attempt_end(a, 'pin', false);
  end loop;
  perform pg_temp.check('DB-52', e.locked_until = now() + interval '24 hours', '3rd lockout is not 24 h');

  -- Guesses sent at the same moment: 3 in flight, the 4th is refused and locks.
  update public.user_credentials set failed_pin_count = 0, lockout_count = 0, locked_until = null where user_id = a;
  for i in 1..3 loop
    select * into b from public.auth_attempt_begin(a, 'pin');
    perform pg_temp.check('DB-52', b.allowed, format('parallel attempt %s refused', i));
  end loop;
  select * into b from public.auth_attempt_begin(a, 'pin');
  perform pg_temp.check('DB-52', not b.allowed and b.locked_until = now() + interval '30 minutes',
    '4th parallel attempt was allowed');

  -- Recovery code: 3 wrong -> 24 h, separate from the PIN counters.
  update public.user_credentials set failed_pin_count = 0, lockout_count = 0, locked_until = null where user_id = a;
  for i in 1..3 loop
    perform public.auth_attempt_begin(a, 'recovery');
    select * into e from public.auth_attempt_end(a, 'recovery', false);
  end loop;
  perform pg_temp.check('DB-52', e.locked_until = now() + interval '24 hours' and e.attempts_left = 0,
    'recovery not locked for 24 h');
  perform pg_temp.check('DB-52', (select failed_pin_count = 0 and locked_until is null
                                  from public.user_credentials where user_id = a), 'recovery touched the PIN lock');
  perform pg_temp.check('DB-52', (select count(*) >= 3 from public.audit_logs where user_id = a and action = 'pin_failed')
    and exists (select 1 from public.audit_logs where user_id = a and action = 'pin_locked')
    and exists (select 1 from public.audit_logs where user_id = a and action = 'recovery_locked'),
    'failed attempts or locks not audited');

  update public.user_credentials set recovery_failed_count = 0, recovery_locked_until = null where user_id = a;
end $$;

-- ---------------------------------------------------------------------------
-- DB-53: sessions: one open session per user; the Edge Function check uses the
-- same 60 s rule as transfer_money.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := pg_temp.uid('690000101');
  d uuid := pg_temp.active_device('690000101');
  s1 constant uuid := '10000000-0000-4000-8000-000000000001';
  s2 constant uuid := '10000000-0000-4000-8000-000000000002';
  r record;
begin
  perform public.auth_open_session(a, d, s1, 'register');
  select * into r from public.auth_check_session('00000000-0000-4000-8000-0000000000a1', s1);
  perform pg_temp.check('DB-53', r.app_user_id = a and r.app_device_id = d, 'check_session returned the wrong user');

  perform public.auth_open_session(a, d, s2, 'pin');
  perform pg_temp.check('DB-53', (select revoked from public.app_sessions where auth_session_id = s1),
    'the older session was not revoked');
  perform pg_temp.expect_app_error('DB-53',
    format('select public.auth_check_session(%L, %L)', '00000000-0000-4000-8000-0000000000a1', s1), 'E11');

  update public.app_sessions set last_seen = now() - interval '61 seconds' where auth_session_id = s2;
  perform pg_temp.expect_app_error('DB-53',
    format('select public.auth_check_session(%L, %L)', '00000000-0000-4000-8000-0000000000a1', s2), 'E11');
  update public.app_sessions set last_seen = now() where auth_session_id = s2;

  -- Only the active device can get a session.
  perform pg_temp.expect_error('DB-53',
    format('select public.auth_open_session(%L, %L, gen_random_uuid(), %L)', a, pg_temp.active_device('690000102'), 'pin'),
    '22023');
  perform pg_temp.check('DB-53', (select count(*) >= 2 from public.audit_logs where user_id = a and action = 'login'),
    'logins not audited');
end $$;

-- ---------------------------------------------------------------------------
-- DB-54: new phone: the old device is deactivated and its push token returned
-- for the "This wasn't me" alert (TC-08, TC-39 server side). Push token rules.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := pg_temp.uid('690000101');
  old_dev uuid := pg_temp.active_device('690000101');
  r record;
begin
  perform public.auth_set_push_token(old_dev, 'ExponentPushToken[a1]');

  -- Same phone: nothing changes.
  select * into r from public.auth_bind_device(a, 'device-a1', 'Test phone');
  perform pg_temp.check('DB-54', r.device_id = old_dev and not r.is_new, 'same phone treated as new');
  perform pg_temp.check('DB-54', not exists (select 1 from public.notifications where user_id = a and kind = 'security'),
    'a login on the same phone created a security alert');

  -- New phone.
  select * into r from public.auth_bind_device(a, 'device-a2', 'New phone');
  perform pg_temp.check('DB-54', r.is_new and r.device_id <> old_dev, 'new phone not bound');
  perform pg_temp.check('DB-54', r.old_device_id = old_dev and r.old_push_token = 'ExponentPushToken[a1]',
    'old device token not returned');
  perform pg_temp.check('DB-54', (select not is_active and replaced_at = now() from public.devices where id = old_dev),
    'old device still active');
  perform pg_temp.check('DB-54', (select count(*) = 1 from public.devices where user_id = a and is_active),
    'not exactly one active device');
  perform pg_temp.check('DB-54', not exists (select 1 from public.app_sessions where device_id = old_dev and not revoked),
    'old device sessions still open');
  perform pg_temp.check('DB-54', exists (select 1 from public.notifications
                                         where user_id = a and kind = 'security'
                                           and title = 'New phone logged in to your wallet'),
    'no security notification');

  -- The same push token on another device row is cleared; an inactive device can't take one.
  perform public.auth_set_push_token(r.device_id, 'ExponentPushToken[a1]');
  perform pg_temp.check('DB-54', (select push_token is null from public.devices where id = old_dev)
    and (select push_token = 'ExponentPushToken[a1]' from public.devices where id = r.device_id),
    'push token not moved to the new device');
  perform pg_temp.expect_app_error('DB-54',
    format('select public.auth_set_push_token(%L, %L)', old_dev, 'ExponentPushToken[x]'), 'E11');
end $$;

-- ---------------------------------------------------------------------------
-- DB-55: "This wasn't me" (TC-26 server side): only the replaced phone, within 7 days.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := pg_temp.uid('690000101');
begin
  perform pg_temp.check('DB-55', not public.auth_freeze('690000101', 'wrong-secret'), 'unknown device froze');
  perform pg_temp.check('DB-55', not public.auth_freeze('690000101', 'device-a2'), 'the ACTIVE device froze');
  perform pg_temp.check('DB-55', not public.auth_freeze('690000199', 'device-a1'), 'unknown number froze');
  perform pg_temp.check('DB-55', (select status = 'active' from public.app_users where id = a), 'frozen too early');
  perform pg_temp.check('DB-55', exists (select 1 from public.audit_logs where user_id = a and action = 'freeze_refused'),
    'refused freeze not audited');

  perform public.auth_open_session(a, pg_temp.active_device('690000101'), '10000000-0000-4000-8000-000000000003', 'pin');
  perform pg_temp.check('DB-55', public.auth_freeze('690000101', 'device-a1'), 'replaced phone could not freeze');
  perform pg_temp.check('DB-55', (select status = 'frozen' from public.app_users where id = a), 'not frozen');
  perform pg_temp.check('DB-55', not exists (select 1 from public.app_sessions where user_id = a and not revoked),
    'sessions still open after freeze');
  perform pg_temp.check('DB-55', exists (select 1 from public.notifications where user_id = a and title = 'Account frozen'),
    'no freeze notification');
  perform pg_temp.check('DB-55', public.auth_freeze('690000101', 'device-a1'), 'freezing twice failed');

  update public.devices set replaced_at = now() - interval '8 days' where device_secret_hash = 'device-a1';
  perform pg_temp.check('DB-55', not public.auth_freeze('690000101', 'device-a1'), 'froze after 7 days');
end $$;

-- ---------------------------------------------------------------------------
-- DB-56: Forgot PIN (TC-25 server side): new hashes, lock cleared, unfrozen,
-- sessions revoked. PIN change and fingerprint on/off.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := pg_temp.uid('690000101');
  d uuid := pg_temp.active_device('690000101');
begin
  update public.user_credentials set failed_pin_count = 3, lockout_count = 1,
    locked_until = now() + interval '30 minutes' where user_id = a;
  perform public.auth_open_session(a, d, '10000000-0000-4000-8000-000000000004', 'pin');

  perform public.auth_reset_pin(a, 'pin-hash-2', 'recovery-hash-2');
  perform pg_temp.check('DB-56', (select pin_hash = 'pin-hash-2' and recovery_hash = 'recovery-hash-2'
                                         and failed_pin_count = 0 and lockout_count = 0 and locked_until is null
                                  from public.user_credentials where user_id = a), 'reset did not update credentials');
  perform pg_temp.check('DB-56', (select status = 'active' from public.app_users where id = a), 'reset did not unfreeze');
  perform pg_temp.check('DB-56', not exists (select 1 from public.app_sessions where user_id = a and not revoked),
    'sessions still open after reset');
  perform pg_temp.check('DB-56', exists (select 1 from public.audit_logs where user_id = a and action = 'pin_reset'
                                                and details ->> 'unfrozen' = 'true'), 'reset not audited');

  perform public.auth_set_pin(a, 'pin-hash-3');
  perform pg_temp.check('DB-56', (pg_temp.creds('690000101')).pin_hash = 'pin-hash-3', 'PIN not changed');

  perform public.auth_set_biometric(d, 'bio-hash');
  perform pg_temp.check('DB-56', (select biometric_secret_hash = 'bio-hash' from public.devices where id = d)
    and exists (select 1 from public.notifications where user_id = a and title = 'Fingerprint login turned on'),
    'fingerprint not turned on');
  perform public.auth_set_biometric(d, null);
  perform pg_temp.check('DB-56', (select biometric_secret_hash is null from public.devices where id = d),
    'fingerprint not turned off');
end $$;

-- ---------------------------------------------------------------------------
-- DB-57: Log out button: session revoked and push token cleared.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := pg_temp.uid('690000101');
  d uuid := pg_temp.active_device('690000101');
  s constant uuid := '10000000-0000-4000-8000-000000000005';
begin
  perform public.auth_open_session(a, d, s, 'pin');
  perform public.auth_set_push_token(d, 'ExponentPushToken[a2]');
  perform public.auth_logout(s);
  perform pg_temp.check('DB-57', (select revoked from public.app_sessions where auth_session_id = s), 'not revoked');
  perform pg_temp.check('DB-57', (select push_token is null from public.devices where id = d), 'push token kept');
end $$;

-- ---------------------------------------------------------------------------
-- DB-58: delete account (TC-33, TC-34 server side) and leftover logins.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := pg_temp.uid('690000101');
  b uuid := pg_temp.uid('690000102');
  d uuid := pg_temp.active_device('690000101');
  v_auth uuid;
begin
  -- Balance > 0: refused.
  perform pg_temp.expect_app_error('DB-58', format('select public.auth_delete_account(%L)', a), 'E14');

  -- Empty the wallet, then delete.
  perform private.move_money((select id from public.wallets where user_id = a),
                             (select id from public.wallets where user_id = b), 100.00, 'transfer', gen_random_uuid());
  perform public.auth_set_push_token(d, 'ExponentPushToken[a3]');
  v_auth := public.auth_delete_account(a);
  perform pg_temp.check('DB-58', v_auth = '00000000-0000-4000-8000-0000000000a1', 'wrong auth user returned');
  perform pg_temp.check('DB-58', (select status = 'deleted' and phone is null from public.app_users where id = a),
    'not deleted');
  perform pg_temp.check('DB-58', not exists (select 1 from public.devices where user_id = a
                                             and (is_active or push_token is not null)), 'devices still active');
  perform pg_temp.check('DB-58', not exists (select 1 from public.app_sessions where user_id = a and not revoked),
    'sessions still open');

  -- The database refuses to remove the auth user of an account that isn't deleted...
  perform pg_temp.expect_error('DB-58',
    $q$delete from auth.users where id = '00000000-0000-4000-8000-0000000000b1'$q$, '23514');
  -- ...but allows it for a deleted one.
  delete from auth.users where id = v_auth;
  perform pg_temp.check('DB-58', (select auth_user_id is null from public.app_users where id = a),
    'auth_user_id not cleared');

  -- The number can register again, as a new account.
  perform pg_temp.register('00000000-0000-4000-8000-0000000000a2', '690000101', 'device-a9');
  perform pg_temp.check('DB-58', pg_temp.uid('690000101') <> a, 'the old account came back');

  -- Leftover logins: older than a minute and not used by any account.
  insert into auth.users (id, email, created_at) values
    ('00000000-0000-4000-8000-0000000000d1', '690000198@users.garaadkaabe.invalid', now() - interval '2 minutes'),
    ('00000000-0000-4000-8000-0000000000d2', '690000197@users.garaadkaabe.invalid', now());
  perform pg_temp.check('DB-58',
    public.auth_orphan_login('690000198@users.garaadkaabe.invalid') = '00000000-0000-4000-8000-0000000000d1',
    'leftover login not found');
  perform pg_temp.check('DB-58', public.auth_orphan_login('690000197@users.garaadkaabe.invalid') is null,
    'a registration in progress was treated as leftover');
  perform pg_temp.check('DB-58', public.auth_orphan_login('690000102@users.garaadkaabe.invalid') is null,
    'a live account''s login was treated as leftover');

  -- A deleted account whose login could not be removed: that login is leftover too,
  -- and removing it is allowed.
  perform pg_temp.register('00000000-0000-4000-8000-0000000000e1', '690000103', 'device-e1');
  perform private.move_money((select id from public.wallets where user_id = pg_temp.uid('690000103')),
                             (select id from public.wallets where user_id = b), 100.00, 'transfer', gen_random_uuid());
  v_auth := public.auth_delete_account(pg_temp.uid('690000103'));
  update auth.users set created_at = now() - interval '2 minutes' where id = v_auth;
  perform pg_temp.check('DB-58', public.auth_orphan_login('690000103@users.garaadkaabe.invalid') = v_auth,
    'the login of a deleted account was not treated as leftover');
  delete from auth.users where id = v_auth;
end $$;

-- ---------------------------------------------------------------------------
-- DB-59: a PIN lock inside a live session (Change PIN, Enable fingerprint) ends
-- that session only, and keeps the push token (an automatic logout, not Log out).
-- ---------------------------------------------------------------------------
do $$
declare
  b uuid := pg_temp.uid('690000102');
  d uuid := pg_temp.active_device('690000102');
  s constant uuid := '10000000-0000-4000-8000-000000000009';
begin
  perform public.auth_open_session(b, d, s, 'pin');
  perform public.auth_set_push_token(d, 'ExponentPushToken[b9]');
  perform public.auth_end_session(s, 'pin_locked');
  perform pg_temp.check('DB-59', (select revoked from public.app_sessions where auth_session_id = s), 'not revoked');
  perform pg_temp.expect_app_error('DB-59',
    format('select public.auth_check_session(%L, %L)', '00000000-0000-4000-8000-0000000000b1', s), 'E11');
  perform pg_temp.check('DB-59', (select push_token = 'ExponentPushToken[b9]' from public.devices where id = d),
    'push token cleared');
  perform pg_temp.check('DB-59', (select count(*) = 1 from public.audit_logs
                                  where user_id = b and action = 'session_ended' and details ->> 'reason' = 'pin_locked'),
    'not audited');

  -- Twice, or an unknown session: nothing happens.
  perform public.auth_end_session(s, 'pin_locked');
  perform public.auth_end_session(gen_random_uuid(), 'pin_locked');
  perform pg_temp.check('DB-59', (select count(*) = 1 from public.audit_logs where user_id = b and action = 'session_ended'),
    'audited twice');
  perform pg_temp.expect_error('DB-59', format('select public.auth_end_session(%L, %L)', s, 'other'), '22023');
end $$;

select 'DB-50..DB-59 passed' as result;

rollback;
