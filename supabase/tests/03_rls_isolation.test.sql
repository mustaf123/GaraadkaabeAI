-- 03: users see only their own rows; server-only tables are unreadable; anon sees nothing.
-- Covers TC-19 (SPEC.md §12).
-- Run with `npm run test:db`. Everything runs in one transaction and is rolled back.

begin;

-- ---------------------------------------------------------------------------
-- Test helpers (live in pg_temp, gone after the rollback)
-- actor: 'owner' (migration role, bypasses RLS), 'anon', or an auth.users id.
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
      json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
end $$;

-- Rows the actor can see for a query.
create function pg_temp.count_as(p_actor text, p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  perform pg_temp.act_as(p_actor);
  execute format('select count(*) from (%s) q', p_sql) into n;
  execute 'reset role';
  return n;
end $$;

-- Rows changed by a statement run as the actor.
create function pg_temp.exec_as(p_actor text, p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  perform pg_temp.act_as(p_actor);
  execute p_sql;
  get diagnostics n = row_count;
  execute 'reset role';
  return n;
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

-- Fails unless the actor sees exactly p_expected rows.
create function pg_temp.expect_count(p_label text, p_actor text, p_sql text, p_expected bigint) returns void
language plpgsql as $$
declare n bigint := pg_temp.count_as(p_actor, p_sql);
begin
  if n <> p_expected then
    raise exception '% failed: [%] % -> expected % rows, saw %', p_label, p_actor, p_sql, p_expected, n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: users A and B. Each gets a $100 welcome bonus, then A sends B $10.
--   auth A = 00000000-0000-4000-8000-00000000000a   user A = 10000000-...-0a   wallet A = 20000000-...-0a
--   auth B = 00000000-0000-4000-8000-00000000000b   user B = 10000000-...-0b   wallet B = 20000000-...-0b
--   tx 1 = A's bonus, tx 2 = B's bonus, tx 3 = A -> B $10
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'test-a@users.garaadkaabe.invalid'),
  ('00000000-0000-4000-8000-00000000000b', 'test-b@users.garaadkaabe.invalid');

insert into public.app_users (id, auth_user_id, phone) values
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', '690000001'),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b', '690000002');

insert into public.user_credentials (user_id, pin_hash, recovery_hash) values
  ('10000000-0000-4000-8000-00000000000a', 'test-hash', 'test-hash'),
  ('10000000-0000-4000-8000-00000000000b', 'test-hash', 'test-hash');

insert into public.devices (id, user_id, device_secret_hash, name) values
  ('30000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a', 'test-hash', 'Phone A'),
  ('30000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-00000000000b', 'test-hash', 'Phone B');

insert into public.wallets (id, user_id, type, balance) values
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a', 'user', 90.00),
  ('20000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-00000000000b', 'user', 110.00);

insert into public.transactions (id, type, sender_wallet_id, receiver_wallet_id, amount, idempotency_key)
select '40000000-0000-4000-8000-000000000001'::uuid, 'welcome_bonus', t.id, '20000000-0000-4000-8000-00000000000a'::uuid, 100.00, gen_random_uuid()
from public.wallets t where t.type = 'system'
union all
select '40000000-0000-4000-8000-000000000002'::uuid, 'welcome_bonus', t.id, '20000000-0000-4000-8000-00000000000b'::uuid, 100.00, gen_random_uuid()
from public.wallets t where t.type = 'system'
union all
select '40000000-0000-4000-8000-000000000003'::uuid, 'transfer', '20000000-0000-4000-8000-00000000000a'::uuid,
       '20000000-0000-4000-8000-00000000000b'::uuid, 10.00, gen_random_uuid();

insert into public.ledger_entries (transaction_id, wallet_id, amount)
select '40000000-0000-4000-8000-000000000001'::uuid, t.id, -100.00 from public.wallets t where t.type = 'system'
union all select '40000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-00000000000a'::uuid, 100.00
union all select '40000000-0000-4000-8000-000000000002'::uuid, t.id, -100.00 from public.wallets t where t.type = 'system'
union all select '40000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-00000000000b'::uuid, 100.00
union all select '40000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-00000000000a'::uuid, -10.00
union all select '40000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-00000000000b'::uuid, 10.00;

update public.wallets set balance = balance - 200.00 where type = 'system';

insert into public.notifications (id, user_id, kind, title, body) values
  ('60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-00000000000a', 'welcome', 'Welcome', '$100.00'),
  ('60000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-00000000000a', 'sent', 'Sent', '$10.00'),
  ('60000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-00000000000b', 'welcome', 'Welcome', '$100.00'),
  ('60000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-00000000000b', 'received', 'Received', '$10.00');

insert into public.app_sessions (user_id, device_id) values
  ('10000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-00000000000a'),
  ('10000000-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-00000000000b');

insert into public.audit_logs (user_id, action) values
  ('10000000-0000-4000-8000-00000000000a', 'test'),
  ('10000000-0000-4000-8000-00000000000b', 'test');

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- TC-19: A and B each see only their own rows. The shared transfer (tx 3) is visible
-- to both, but each sees only their own ledger line of it. The Treasury is invisible.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
  b constant text := '00000000-0000-4000-8000-00000000000b';
begin
  -- user A
  perform pg_temp.expect_count('TC-19', a, $q$select 1 from public.app_users$q$, 1);
  perform pg_temp.expect_count('TC-19', a, $q$select 1 from public.app_users where id = '10000000-0000-4000-8000-00000000000a'$q$, 1);
  perform pg_temp.expect_count('TC-19', a, $q$select 1 from public.wallets$q$, 1);
  perform pg_temp.expect_count('TC-19', a, $q$select 1 from public.wallets where id = '20000000-0000-4000-8000-00000000000a'$q$, 1);
  perform pg_temp.expect_count('TC-19', a, $q$select 1 from public.transactions$q$, 2);
  perform pg_temp.expect_count('TC-19', a, $q$select 1 from public.transactions where id = '40000000-0000-4000-8000-000000000002'$q$, 0);
  perform pg_temp.expect_count('TC-19', a, $q$select 1 from public.ledger_entries$q$, 2);
  perform pg_temp.expect_count('TC-19', a, $q$select 1 from public.ledger_entries where wallet_id <> '20000000-0000-4000-8000-00000000000a'$q$, 0);
  perform pg_temp.expect_count('TC-19', a, $q$select 1 from public.notifications$q$, 2);
  perform pg_temp.expect_count('TC-19', a, $q$select 1 from public.notifications where user_id <> '10000000-0000-4000-8000-00000000000a'$q$, 0);

  -- user B (mirror image)
  perform pg_temp.expect_count('TC-19', b, $q$select 1 from public.app_users$q$, 1);
  perform pg_temp.expect_count('TC-19', b, $q$select 1 from public.app_users where id = '10000000-0000-4000-8000-00000000000b'$q$, 1);
  perform pg_temp.expect_count('TC-19', b, $q$select 1 from public.wallets$q$, 1);
  perform pg_temp.expect_count('TC-19', b, $q$select 1 from public.wallets where id = '20000000-0000-4000-8000-00000000000b'$q$, 1);
  perform pg_temp.expect_count('TC-19', b, $q$select 1 from public.transactions$q$, 2);
  perform pg_temp.expect_count('TC-19', b, $q$select 1 from public.transactions where id = '40000000-0000-4000-8000-000000000001'$q$, 0);
  perform pg_temp.expect_count('TC-19', b, $q$select 1 from public.ledger_entries$q$, 2);
  perform pg_temp.expect_count('TC-19', b, $q$select 1 from public.ledger_entries where wallet_id <> '20000000-0000-4000-8000-00000000000b'$q$, 0);
  perform pg_temp.expect_count('TC-19', b, $q$select 1 from public.notifications$q$, 2);

  -- nobody sees the System Treasury wallet
  perform pg_temp.expect_count('TC-19', a, $q$select 1 from public.wallets where type = 'system'$q$, 0);
end $$;

-- DB-20: server-only tables can't be read by a logged-in user at all (not even own rows).
do $$
declare
  v_table text;
begin
  foreach v_table in array array['user_credentials', 'devices', 'app_sessions', 'audit_logs'] loop
    perform pg_temp.expect_error('DB-20', '00000000-0000-4000-8000-00000000000a',
      format('select 1 from public.%I', v_table), '42501');
  end loop;
end $$;

-- DB-21: the anon key can't read any table.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['app_users', 'user_credentials', 'devices', 'wallets', 'transactions',
                                 'ledger_entries', 'notifications', 'app_sessions', 'audit_logs'] loop
    perform pg_temp.expect_error('DB-21', 'anon', format('select 1 from public.%I', v_table), '42501');
  end loop;
end $$;

-- DB-22: A can't change B's rows, even in the columns A may update on their own.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
begin
  if pg_temp.exec_as(a, $q$update public.notifications set read_at = now()
                          where id = '60000000-0000-4000-8000-0000000000b1'$q$) <> 0 then
    raise exception 'DB-22 failed: A marked B''s notification read';
  end if;
  if pg_temp.exec_as(a, $q$update public.app_users set language = 'so'
                          where id = '10000000-0000-4000-8000-00000000000b'$q$) <> 0 then
    raise exception 'DB-22 failed: A changed B''s language';
  end if;
  if (select read_at from public.notifications where id = '60000000-0000-4000-8000-0000000000b1') is not null then
    raise exception 'DB-22 failed: B''s notification changed';
  end if;
end $$;

-- DB-23: a frozen user can still read their own data; a deleted user sees nothing.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
begin
  update public.app_users set status = 'frozen' where id = '10000000-0000-4000-8000-00000000000a';
  perform pg_temp.expect_count('DB-23', a, $q$select 1 from public.wallets$q$, 1);

  update public.app_users set status = 'deleted', phone = null where id = '10000000-0000-4000-8000-00000000000a';
  perform pg_temp.expect_count('DB-23', a, $q$select 1 from public.app_users$q$, 0);
  perform pg_temp.expect_count('DB-23', a, $q$select 1 from public.wallets$q$, 0);
  perform pg_temp.expect_count('DB-23', a, $q$select 1 from public.transactions$q$, 0);
  perform pg_temp.expect_count('DB-23', a, $q$select 1 from public.ledger_entries$q$, 0);
  perform pg_temp.expect_count('DB-23', a, $q$select 1 from public.notifications$q$, 0);
end $$;

select 'TC-19 passed; DB-20..DB-23 passed' as result;

rollback;
