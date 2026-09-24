-- 05: lookup_receiver, my_transactions (History) and get_receipt.
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

create function pg_temp.send_as(p_actor text, p_phone text, p_amount text) returns public.money_item
language plpgsql as $$
declare
  r public.money_item;
begin
  perform pg_temp.act_as(p_actor);
  r := public.transfer_money(p_phone, p_amount, gen_random_uuid());
  execute 'reset role';
  return r;
end $$;

-- my_transactions called as the actor.
create function pg_temp.history_as(p_actor text, p_direction text default 'all',
                                   p_before_created_at timestamptz default null,
                                   p_before_id uuid default null, p_limit integer default 50)
returns setof public.money_item
language plpgsql as $$
begin
  perform pg_temp.act_as(p_actor);
  return query select * from public.my_transactions(p_direction, p_before_created_at, p_before_id, p_limit);
  execute 'reset role';
end $$;

create function pg_temp.receipt_as(p_actor text, p_transaction_id uuid) returns public.money_item
language plpgsql as $$
declare
  r public.money_item;
begin
  perform pg_temp.act_as(p_actor);
  r := public.get_receipt(p_transaction_id);
  execute 'reset role';
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: A 690000001, B 690000002, C 690000003. Everyone starts with $100.00.
--   1. B -> A $21.50     2. A -> B $10.00     3. A -> C $5.00     4. B -> C $1.00 (A not involved)
-- All rows share one transaction timestamp here, so the fixture spreads created_at
-- out (welcome bonuses oldest, then 1..4) to make "newest first" testable.
-- ---------------------------------------------------------------------------

select pg_temp.make_user('00000000-0000-4000-8000-00000000000a', '690000001');
select pg_temp.make_user('00000000-0000-4000-8000-00000000000b', '690000002');
select pg_temp.make_user('00000000-0000-4000-8000-00000000000c', '690000003');

create temp table fixture_tx (n int primary key, id uuid) on commit drop;

insert into fixture_tx
select 1, (pg_temp.send_as('00000000-0000-4000-8000-00000000000b', '690000001', '21.50')).transaction_id;
insert into fixture_tx
select 2, (pg_temp.send_as('00000000-0000-4000-8000-00000000000a', '690000002', '10')).transaction_id;
insert into fixture_tx
select 3, (pg_temp.send_as('00000000-0000-4000-8000-00000000000a', '690000003', '5')).transaction_id;
insert into fixture_tx
select 4, (pg_temp.send_as('00000000-0000-4000-8000-00000000000b', '690000003', '1')).transaction_id;

update public.transactions set created_at = now() - interval '1 day' where type = 'welcome_bonus'
  and receiver_wallet_id in (select w.id from public.wallets w join public.app_users u on u.id = w.user_id
                             where u.phone in ('690000001', '690000002', '690000003'));
update public.transactions t set created_at = now() - make_interval(mins => 10 - f.n)
from fixture_tx f where t.id = f.id;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- DB-40: lookup_receiver returns the masked number, or E01 / E06 / E07.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
  v_masked text;
begin
  perform pg_temp.act_as(a);
  v_masked := public.lookup_receiver('690000002');
  reset role;
  perform pg_temp.check('DB-40', v_masked = '69X XXX 0002', format('masked number %s', v_masked));

  perform pg_temp.expect_app_error('DB-40', a, $q$select public.lookup_receiver('690000099')$q$, 'E06');
  perform pg_temp.expect_app_error('DB-40', a, $q$select public.lookup_receiver('690000001')$q$, 'E07');
  perform pg_temp.expect_app_error('DB-40', a, $q$select public.lookup_receiver('12345')$q$, 'E01');
  perform pg_temp.expect_error('DB-40', 'anon', $q$select public.lookup_receiver('690000002')$q$, '42501');

  -- a frozen account looks unregistered (its status stays private)
  update public.app_users set status = 'frozen' where phone = '690000003';
  perform pg_temp.expect_app_error('DB-40', a, $q$select public.lookup_receiver('690000003')$q$, 'E06');
  update public.app_users set status = 'active' where phone = '690000003';
end $$;

-- DB-41: History shows only A's money, newest first, other person's number masked.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
  v_rows public.money_item[];
begin
  v_rows := array(select h from pg_temp.history_as(a) h);

  perform pg_temp.check('DB-41', cardinality(v_rows) = 4,
    format('A should see 4 rows (bonus, 1, 2, 3), saw %s', cardinality(v_rows)));
  perform pg_temp.check('DB-41', not exists (select 1 from unnest(v_rows) r
                                             where r.transaction_id = (select id from fixture_tx where n = 4)),
    'A sees B -> C, which A is not part of');

  -- newest first: 3, 2, 1, bonus
  perform pg_temp.check('DB-41', (v_rows[1]).transaction_id = (select id from fixture_tx where n = 3)
                                 and (v_rows[2]).transaction_id = (select id from fixture_tx where n = 2)
                                 and (v_rows[3]).transaction_id = (select id from fixture_tx where n = 1)
                                 and (v_rows[4]).type = 'welcome_bonus',
    'rows are not newest first');

  -- A -> C $5: sent, C masked, balance after = 100 + 21.50 - 10 - 5
  perform pg_temp.check('DB-41', (v_rows[1]).direction = 'sent' and (v_rows[1]).amount = 5.00
                                 and (v_rows[1]).counterparty_masked = '69X XXX 0003'
                                 and (v_rows[1]).balance_after = 106.50 and (v_rows[1]).fee = 0.00,
    format('row "A -> C" wrong: %s', v_rows[1]));
  -- B -> A $21.50: received, B masked
  perform pg_temp.check('DB-41', (v_rows[3]).direction = 'received' and (v_rows[3]).amount = 21.50
                                 and (v_rows[3]).counterparty_masked = '69X XXX 0002'
                                 and (v_rows[3]).balance_after = 121.50,
    format('row "B -> A" wrong: %s', v_rows[3]));
  -- welcome bonus: received, no other person
  perform pg_temp.check('DB-41', (v_rows[4]).direction = 'received' and (v_rows[4]).amount = 100.00
                                 and (v_rows[4]).counterparty_masked is null and (v_rows[4]).balance_after = 100.00,
    format('welcome bonus row wrong: %s', v_rows[4]));

  -- no full phone number anywhere in the output
  perform pg_temp.check('DB-41', not exists (select 1 from unnest(v_rows) r where r.counterparty_masked ~ '[0-9]{9}'),
    'an unmasked number was returned');
end $$;

-- DB-42: Sent / Received filters, paging, limits.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
  v_page1 public.money_item[];
  v_page2 public.money_item[];
begin
  perform pg_temp.check('DB-42', (select count(*) from pg_temp.history_as(a, 'sent')) = 2
                                 and not exists (select 1 from pg_temp.history_as(a, 'sent') h where h.direction <> 'sent'),
    'Sent filter wrong');
  perform pg_temp.check('DB-42', (select count(*) from pg_temp.history_as(a, 'received')) = 2
                                 and not exists (select 1 from pg_temp.history_as(a, 'received') h where h.direction <> 'received'),
    'Received filter wrong');

  v_page1 := array(select h from pg_temp.history_as(a, 'all', null, null, 2) h);
  v_page2 := array(select h from pg_temp.history_as(a, 'all', (v_page1[2]).created_at, (v_page1[2]).transaction_id, 2) h);
  perform pg_temp.check('DB-42', cardinality(v_page1) = 2 and cardinality(v_page2) = 2
                                 and (v_page2[1]).transaction_id = (select id from fixture_tx where n = 1)
                                 and (v_page2[2]).type = 'welcome_bonus',
    'paging returned the wrong rows');

  perform pg_temp.check('DB-42', (select count(*) from pg_temp.history_as(a, 'all', null, null, 1)) = 1,
    'limit ignored');
  perform pg_temp.expect_error('DB-42', a, $q$select * from public.my_transactions('everything')$q$, '22023');
end $$;

-- DB-43: get_receipt shows each side its own view; strangers get NULL.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
  b constant text := '00000000-0000-4000-8000-00000000000b';
  c constant text := '00000000-0000-4000-8000-00000000000c';
  v_tx2 uuid := (select id from fixture_tx where n = 2);
  r public.money_item;
begin
  r := pg_temp.receipt_as(a, v_tx2);
  perform pg_temp.check('DB-43', r.direction = 'sent' and r.counterparty_masked = '69X XXX 0002' and r.balance_after = 111.50,
    format('sender receipt wrong: %s', r));
  r := pg_temp.receipt_as(b, v_tx2);
  perform pg_temp.check('DB-43', r.direction = 'received' and r.counterparty_masked = '69X XXX 0001' and r.balance_after = 88.50,
    format('receiver receipt wrong: %s', r));
  r := pg_temp.receipt_as(c, v_tx2);
  perform pg_temp.check('DB-43', r.transaction_id is null, 'a stranger could read the receipt');
end $$;

-- DB-44: History and receipts also enforce the 60 s session rule.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
begin
  update public.app_sessions set last_seen = now() - interval '61 seconds' where auth_session_id = a::uuid;
  perform pg_temp.expect_app_error('DB-44', a, $q$select * from public.my_transactions()$q$, 'E11');
  perform pg_temp.expect_app_error('DB-44', a, $q$select public.get_receipt(gen_random_uuid())$q$, 'E11');
  perform pg_temp.expect_app_error('DB-44', a, $q$select public.lookup_receiver('690000002')$q$, 'E11');
end $$;

select 'DB-40..DB-44 passed' as result;

rollback;
