-- 04: transfer_money. Covers TC-10..TC-16, TC-24 and TC-40 (SPEC.md §12).
-- TC-17 (two sends at the same moment) needs two connections: scripts/test-concurrency.mjs.
-- Run with `npm run test:db`. Everything runs in one transaction and is rolled back.

begin;

-- ---------------------------------------------------------------------------
-- Test helpers (live in pg_temp, gone after the rollback)
-- actor: 'owner' (migration role, bypasses RLS), 'anon', or an auth.users id.
-- A logged-in actor's token carries session_id = its auth id (see make_user).
-- ---------------------------------------------------------------------------

create function pg_temp.act_as(p_actor text) returns void
language plpgsql as $$
begin
  if p_actor = 'owner' then
    execute 'reset role';
  elsif p_actor = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_actor, 'role', 'authenticated', 'session_id', p_actor)::text, true);
    execute 'set local role authenticated';
  end if;
end $$;

-- Fails unless the statement raises the expected SQLSTATE.
create function pg_temp.expect_error(p_label text, p_actor text, p_sql text, p_sqlstate text) returns void
language plpgsql as $$
begin
  perform pg_temp.act_as(p_actor);
  begin
    execute p_sql;
  exception when others then
    execute 'reset role';
    if sqlstate <> p_sqlstate then
      raise exception '% failed: [%] % -> expected error %, got % (%)',
        p_label, p_actor, p_sql, p_sqlstate, sqlstate, sqlerrm;
    end if;
    return;
  end;
  execute 'reset role';
  raise exception '% failed: [%] % -> should have been rejected with %, but it succeeded',
    p_label, p_actor, p_sql, p_sqlstate;
end $$;

-- Fails unless the statement raises the app error code (message = 'E08' etc.).
create function pg_temp.expect_app_error(p_label text, p_actor text, p_sql text, p_code text) returns void
language plpgsql as $$
begin
  perform pg_temp.act_as(p_actor);
  begin
    execute p_sql;
  exception when others then
    execute 'reset role';
    if sqlerrm <> p_code then
      raise exception '% failed: [%] % -> expected %, got % (%)',
        p_label, p_actor, p_sql, p_code, sqlerrm, sqlstate;
    end if;
    return;
  end;
  execute 'reset role';
  raise exception '% failed: [%] % -> expected %, but it succeeded', p_label, p_actor, p_sql, p_code;
end $$;

create function pg_temp.check(p_label text, p_ok boolean, p_what text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception '% failed: %', p_label, p_what;
  end if;
end $$;

-- A registered user with a device, a live session and the $100.00 welcome bonus.
create function pg_temp.make_user(p_auth uuid, p_phone text) returns uuid
language plpgsql as $$
declare
  v_user   uuid;
  v_device uuid;
begin
  insert into auth.users (id, email) values (p_auth, p_phone || '@users.garaadkaabe.invalid');
  insert into public.app_users (auth_user_id, phone) values (p_auth, p_phone)
    returning id into v_user;
  insert into public.user_credentials (user_id, pin_hash, recovery_hash) values (v_user, 'test-hash', 'test-hash');
  insert into public.devices (user_id, device_secret_hash) values (v_user, 'test-hash') returning id into v_device;
  insert into public.wallets (user_id, type) values (v_user, 'user');
  insert into public.app_sessions (user_id, device_id, auth_session_id) values (v_user, v_device, p_auth);
  perform public.grant_welcome_bonus(v_user);
  return v_user;
end $$;

-- transfer_money called as the actor.
create function pg_temp.send_as(p_actor text, p_phone text, p_amount text, p_key uuid default gen_random_uuid())
returns public.money_item
language plpgsql as $$
declare
  r public.money_item;
begin
  perform pg_temp.act_as(p_actor);
  r := public.transfer_money(p_phone, p_amount, p_key);
  execute 'reset role';
  return r;
end $$;

create function pg_temp.balance_of(p_phone text) returns numeric
language sql as $$
  select w.balance from public.wallets w join public.app_users u on u.id = w.user_id where u.phone = p_phone
$$;

create function pg_temp.sent_count(p_phone text) returns bigint
language sql as $$
  select count(*) from public.transactions t
  join public.wallets w on w.id = t.sender_wallet_id
  join public.app_users u on u.id = w.user_id
  where u.phone = p_phone
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
--   A 690000001             auth ...0a
--   B 690000002             auth ...0b
--   C 690000003             auth ...0c   (frozen later)
--   D 690000004             auth ...0d   (deleted later)
-- Everyone gets $100.00; then B sends A $21.50, so A has $121.50 (TC-12) and B $78.50.
-- ---------------------------------------------------------------------------

select pg_temp.make_user('00000000-0000-4000-8000-00000000000a', '690000001');
select pg_temp.make_user('00000000-0000-4000-8000-00000000000b', '690000002');
select pg_temp.make_user('00000000-0000-4000-8000-00000000000c', '690000003');
select pg_temp.make_user('00000000-0000-4000-8000-00000000000d', '690000004');
select pg_temp.send_as('00000000-0000-4000-8000-00000000000b', '690000001', '21.50');

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- TC-10: send to an unregistered number -> E06.
do $$
begin
  perform pg_temp.expect_app_error('TC-10', '00000000-0000-4000-8000-00000000000a',
    $q$select public.transfer_money('690000099', '5', gen_random_uuid())$q$, 'E06');
end $$;

-- TC-11: send to your own number -> E07.
do $$
begin
  perform pg_temp.expect_app_error('TC-11', '00000000-0000-4000-8000-00000000000a',
    $q$select public.transfer_money('690000001', '5', gen_random_uuid())$q$, 'E07');
end $$;

-- TC-12: send $150 with a $121.50 balance -> E08, and nothing moves.
do $$
begin
  perform pg_temp.check('TC-12', pg_temp.balance_of('690000001') = 121.50,
    format('fixture balance should be 121.50, is %s', pg_temp.balance_of('690000001')));
  perform pg_temp.expect_app_error('TC-12', '00000000-0000-4000-8000-00000000000a',
    $q$select public.transfer_money('690000002', '150', gen_random_uuid())$q$, 'E08');
  perform pg_temp.check('TC-12', pg_temp.balance_of('690000001') = 121.50, 'balance changed after E08');
end $$;

-- TC-13: $0, $10.555 and other malformed amounts -> E09, checked before any rounding.
do $$
declare
  v_amount text;
  v_before bigint := pg_temp.sent_count('690000001');
begin
  foreach v_amount in array array['0', '0.00', '10.555', '0.001', '-5', 'abc', '1e3', '', ' 10', '10.',
                                  '.5', '1,000', '12345678901'] loop
    perform pg_temp.expect_app_error('TC-13', '00000000-0000-4000-8000-00000000000a',
      format($q$select public.transfer_money('690000002', %L, gen_random_uuid())$q$, v_amount), 'E09');
  end loop;
  perform pg_temp.expect_app_error('TC-13', '00000000-0000-4000-8000-00000000000a',
    $q$select public.transfer_money('690000002', null, gen_random_uuid())$q$, 'E09');
  perform pg_temp.check('TC-13', pg_temp.sent_count('690000001') = v_before, 'a transaction was written');
  perform pg_temp.check('TC-13', pg_temp.balance_of('690000001') = 121.50, 'balance changed');
end $$;

-- TC-14: send $10 to a valid user: receipt, both balances, ledger, notifications, audit.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
  r public.money_item;
begin
  r := pg_temp.send_as(a, '690000002', '10', '70000000-0000-4000-8000-000000000001');

  perform pg_temp.check('TC-14', r.type = 'transfer' and r.direction = 'sent' and r.status = 'completed',
    format('receipt type/direction/status: %s / %s / %s', r.type, r.direction, r.status));
  perform pg_temp.check('TC-14', r.amount = 10.00 and r.fee = 0.00, format('amount %s fee %s', r.amount, r.fee));
  perform pg_temp.check('TC-14', r.counterparty_masked = '69X XXX 0002', format('receiver shown as %s', r.counterparty_masked));
  perform pg_temp.check('TC-14', r.balance_after = 111.50, format('receipt new balance %s', r.balance_after));
  perform pg_temp.check('TC-14', r.reference ~ '^TX-[0-9]{8}-[0-9]{6,}$', format('reference %s', r.reference));

  perform pg_temp.check('TC-14', pg_temp.balance_of('690000001') = 111.50, 'sender balance is not 111.50');
  perform pg_temp.check('TC-14', pg_temp.balance_of('690000002') = 88.50, 'receiver balance is not 88.50');

  perform pg_temp.check('TC-14',
    (select count(*) = 2 and sum(amount) = 0 from public.ledger_entries where transaction_id = r.transaction_id),
    'expected 2 ledger lines summing to 0');
  perform pg_temp.check('TC-14',
    (select balance_after = 111.50 and amount = -10.00 from public.ledger_entries l
     join public.wallets w on w.id = l.wallet_id join public.app_users u on u.id = w.user_id
     where l.transaction_id = r.transaction_id and u.phone = '690000001'),
    'sender ledger line wrong');
  perform pg_temp.check('TC-14',
    (select balance_after = 88.50 and amount = 10.00 from public.ledger_entries l
     join public.wallets w on w.id = l.wallet_id join public.app_users u on u.id = w.user_id
     where l.transaction_id = r.transaction_id and u.phone = '690000002'),
    'receiver ledger line wrong');

  -- Sender and receiver notifications, text as in the mockups.
  perform pg_temp.check('TC-14',
    (select count(*) = 1 from public.notifications n join public.app_users u on u.id = n.user_id
     where u.phone = '690000001' and n.kind = 'sent' and n.title = 'Money sent'
       and n.body = 'You sent $10.00 to 69X XXX 0002. New balance $111.50.'),
    'sender notification missing or wrong');
  perform pg_temp.check('TC-14',
    (select count(*) = 1 from public.notifications n join public.app_users u on u.id = n.user_id
     where u.phone = '690000002' and n.kind = 'received' and n.title = 'Money received'
       and n.body = 'You received $10.00 from 69X XXX 0001.'),
    'receiver notification missing or wrong');

  perform pg_temp.check('TC-14',
    (select count(*) = 1 from public.audit_logs l join public.app_users u on u.id = l.user_id
     where u.phone = '690000001' and l.action = 'transfer' and l.device_id is not null
       and l.details ->> 'transaction_id' = r.transaction_id::text
       and l.details ->> 'reference' = r.reference),
    'audit row missing');
end $$;

-- TC-15: no PIN is asked when sending: the function has no PIN input at all.
do $$
begin
  perform pg_temp.check('TC-15',
    pg_get_function_identity_arguments('public.transfer_money(text, text, uuid)'::regprocedure)
      = 'p_receiver_phone text, p_amount text, p_idempotency_key uuid',
    'transfer_money signature changed');
end $$;

-- TC-16: double tap / retry with the same key -> one transaction, same receipt.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
  k constant uuid := '70000000-0000-4000-8000-000000000002';
  r1 public.money_item;
  r2 public.money_item;
  r3 public.money_item;
  v_notifications bigint;
begin
  r1 := pg_temp.send_as(a, '690000002', '5', k);
  v_notifications := (select count(*) from public.notifications);
  r2 := pg_temp.send_as(a, '690000002', '5', k);
  r3 := pg_temp.send_as(a, '690000002', '5.00', k);  -- same amount, written differently

  perform pg_temp.check('TC-16', r1.transaction_id = r2.transaction_id and r1.transaction_id = r3.transaction_id
                                 and r1.reference = r2.reference,
    'retry returned a different transaction');
  perform pg_temp.check('TC-16', (select count(*) = 1 from public.transactions where idempotency_key = k),
    'more than one transaction for one key');
  perform pg_temp.check('TC-16', pg_temp.balance_of('690000001') = 106.50,
    format('sender balance %s, expected 106.50 (moved once)', pg_temp.balance_of('690000001')));
  perform pg_temp.check('TC-16', (select count(*) from public.notifications) = v_notifications,
    'retry created extra notifications');
end $$;

-- TC-40: same key but a different request -> E15 "Request conflict".
do $$
begin
  -- different amount
  perform pg_temp.expect_app_error('TC-40', '00000000-0000-4000-8000-00000000000a',
    $q$select public.transfer_money('690000002', '6', '70000000-0000-4000-8000-000000000002')$q$, 'E15');
  -- different receiver
  perform pg_temp.expect_app_error('TC-40', '00000000-0000-4000-8000-00000000000a',
    $q$select public.transfer_money('690000003', '5', '70000000-0000-4000-8000-000000000002')$q$, 'E15');
  -- different sender reusing someone else's key
  perform pg_temp.expect_app_error('TC-40', '00000000-0000-4000-8000-00000000000b',
    $q$select public.transfer_money('690000001', '5', '70000000-0000-4000-8000-000000000002')$q$, 'E15');
  perform pg_temp.check('TC-40', pg_temp.balance_of('690000001') = 106.50, 'money moved on a conflict');
end $$;

-- TC-24: server-side idle rule. More than 60 s since the last request -> E11.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
begin
  update public.app_sessions set last_seen = now() - interval '61 seconds' where auth_session_id = a::uuid;
  perform pg_temp.expect_app_error('TC-24', a,
    $q$select public.transfer_money('690000002', '1', gen_random_uuid())$q$, 'E11');

  -- 59 s is still fine, and the call refreshes last_seen
  update public.app_sessions set last_seen = now() - interval '59 seconds' where auth_session_id = a::uuid;
  perform pg_temp.send_as(a, '690000002', '1');
  perform pg_temp.check('TC-24', (select last_seen = now() from public.app_sessions where auth_session_id = a::uuid),
    'last_seen was not refreshed');

  -- revoked session (logout) -> E11
  update public.app_sessions set revoked = true where auth_session_id = a::uuid;
  perform pg_temp.expect_app_error('TC-24', a,
    $q$select public.transfer_money('690000002', '1', gen_random_uuid())$q$, 'E11');
  update public.app_sessions set revoked = false where auth_session_id = a::uuid;

  -- a token whose session has no app_sessions row -> E11
  perform pg_temp.act_as(a);
  perform set_config('request.jwt.claims',
    json_build_object('sub', a, 'role', 'authenticated', 'session_id', gen_random_uuid())::text, true);
  begin
    perform public.transfer_money('690000002', '1', gen_random_uuid());
    raise exception 'TC-24 failed: unknown session_id was accepted';
  exception when others then
    if sqlerrm <> 'E11' then raise; end if;
  end;
  reset role;
end $$;

-- DB-30: a frozen sender gets E10; a locked one E05.
do $$
begin
  update public.app_users set status = 'frozen' where phone = '690000001';
  perform pg_temp.expect_app_error('DB-30', '00000000-0000-4000-8000-00000000000a',
    $q$select public.transfer_money('690000002', '1', gen_random_uuid())$q$, 'E10');
  update public.app_users set status = 'locked' where phone = '690000001';
  perform pg_temp.expect_app_error('DB-30', '00000000-0000-4000-8000-00000000000a',
    $q$select public.transfer_money('690000002', '1', gen_random_uuid())$q$, 'E05');
  update public.app_users set status = 'active' where phone = '690000001';
end $$;

-- DB-31: frozen or deleted receivers count as "not registered" (E06).
do $$
begin
  update public.app_users set status = 'frozen' where phone = '690000003';
  perform pg_temp.expect_app_error('DB-31', '00000000-0000-4000-8000-00000000000a',
    $q$select public.transfer_money('690000003', '1', gen_random_uuid())$q$, 'E06');
  update public.app_users set status = 'deleted', phone = null where auth_user_id = '00000000-0000-4000-8000-00000000000d';
  perform pg_temp.expect_app_error('DB-31', '00000000-0000-4000-8000-00000000000a',
    $q$select public.transfer_money('690000004', '1', gen_random_uuid())$q$, 'E06');
end $$;

-- DB-32: malformed receiver numbers -> E01.
do $$
declare
  v_phone text;
begin
  foreach v_phone in array array['12345', '6900000011', 'abcdefghi', '+252690000002', ''] loop
    perform pg_temp.expect_app_error('DB-32', '00000000-0000-4000-8000-00000000000a',
      format($q$select public.transfer_money(%L, '1', gen_random_uuid())$q$, v_phone), 'E01');
  end loop;
end $$;

-- DB-33: who may call what.
do $$
begin
  perform pg_temp.expect_error('DB-33', 'anon',
    $q$select public.transfer_money('690000002', '1', gen_random_uuid())$q$, '42501');
  perform pg_temp.expect_error('DB-33', '00000000-0000-4000-8000-00000000000a',
    $q$select public.grant_welcome_bonus(id) from public.app_users limit 1$q$, '42501');
  perform pg_temp.expect_error('DB-33', '00000000-0000-4000-8000-00000000000a',
    $q$select private.move_money(gen_random_uuid(), gen_random_uuid(), 1, 'transfer', gen_random_uuid())$q$, '42501');

  perform pg_temp.check('DB-33', has_function_privilege('service_role', 'public.grant_welcome_bonus(uuid)', 'execute'),
    'service_role cannot run grant_welcome_bonus');
  perform pg_temp.check('DB-33', not has_function_privilege('authenticated', 'public.grant_welcome_bonus(uuid)', 'execute'),
    'the app can run grant_welcome_bonus');
  perform pg_temp.check('DB-33',
    has_function_privilege('authenticated', 'public.transfer_money(text, text, uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.lookup_receiver(text)', 'execute')
    and has_function_privilege('authenticated', 'public.my_transactions(text, timestamptz, uuid, integer)', 'execute')
    and has_function_privilege('authenticated', 'public.get_receipt(uuid)', 'execute'),
    'the app cannot run one of its functions');
  perform pg_temp.check('DB-33',
    not has_function_privilege('anon', 'public.transfer_money(text, text, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.lookup_receiver(text)', 'execute')
    and not has_function_privilege('anon', 'public.my_transactions(text, timestamptz, uuid, integer)', 'execute')
    and not has_function_privilege('anon', 'public.get_receipt(uuid)', 'execute'),
    'anon can run a money function');
end $$;

-- DB-34: the welcome bonus is paid once per wallet, only to active users.
do $$
declare
  v_user uuid := (select id from public.app_users where phone = '690000001');
  v_before numeric := pg_temp.balance_of('690000001');
  r public.money_item;
begin
  r := public.grant_welcome_bonus(v_user);
  perform pg_temp.check('DB-34', r.type = 'welcome_bonus' and r.amount = 100.00 and r.counterparty_masked is null,
    'second call did not return the first bonus');
  perform pg_temp.check('DB-34', pg_temp.balance_of('690000001') = v_before, 'bonus paid twice');
  perform pg_temp.check('DB-34',
    (select count(*) = 1 from public.transactions t join public.wallets w on w.id = t.receiver_wallet_id
     where w.user_id = v_user and t.type = 'welcome_bonus'),
    'more than one welcome bonus row');
  perform pg_temp.expect_error('DB-34', 'owner',
    $q$select public.grant_welcome_bonus(id) from public.app_users where phone = '690000003'$q$, '22023');
end $$;

-- DB-35: move_money re-checks the receiver AFTER locking. A transfer that passed the
-- receiver check and then waited for the lock while the receiver deleted (or froze)
-- the account must not pay that wallet. Calling move_money directly plays the part
-- of the transfer that already passed step 4.
do $$
declare
  v_a_wallet uuid := (select w.id from public.wallets w join public.app_users u on u.id = w.user_id
                      where u.phone = '690000001');
  v_b_wallet uuid := (select w.id from public.wallets w join public.app_users u on u.id = w.user_id
                      where u.phone = '690000002');
  v_key uuid := gen_random_uuid();
  v_a_before numeric := pg_temp.balance_of('690000001');
  v_b_before numeric := pg_temp.balance_of('690000002');
begin
  update public.app_users set status = 'frozen' where phone = '690000002';
  perform pg_temp.expect_app_error('DB-35', 'owner',
    format('select private.move_money(%L, %L, 1.00, %L, %L)', v_a_wallet, v_b_wallet, 'transfer', v_key), 'E06');
  perform pg_temp.check('DB-35', not exists (select 1 from public.transactions where idempotency_key = v_key),
    'a transaction was written');
  perform pg_temp.check('DB-35', pg_temp.balance_of('690000001') = v_a_before
    and pg_temp.balance_of('690000002') = v_b_before, 'money moved');
  update public.app_users set status = 'active' where phone = '690000002';
end $$;

select 'TC-10..TC-16, TC-24, TC-40 passed; DB-30..DB-35 passed' as result;

rollback;
