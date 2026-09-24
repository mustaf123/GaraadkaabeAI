-- 01: schema rules (constraints, insert-only guards, System Treasury, default privileges).
-- Run with `npm run test:db`. Everything runs in one transaction and is rolled back.
-- A failing check raises 'DB-xx failed: <reason>' and stops the file.

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

-- ---------------------------------------------------------------------------
-- Fixtures: user A with credentials, device, wallet and one welcome bonus.
--   auth A = 00000000-0000-4000-8000-00000000000a
--   user A = 10000000-0000-4000-8000-00000000000a
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'test-a@users.garaadkaabe.invalid');

insert into public.app_users (id, auth_user_id, phone) values
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', '690000001');

insert into public.user_credentials (user_id, pin_hash, recovery_hash) values
  ('10000000-0000-4000-8000-00000000000a', 'test-hash', 'test-hash');

insert into public.devices (id, user_id, device_secret_hash, name) values
  ('30000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a', 'test-hash', 'Phone A');

insert into public.wallets (id, user_id, type, balance) values
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a', 'user', 100.00);

insert into public.transactions (id, type, sender_wallet_id, receiver_wallet_id, amount, idempotency_key)
select '40000000-0000-4000-8000-000000000001', 'welcome_bonus', w.id,
       '20000000-0000-4000-8000-00000000000a', 100.00, '50000000-0000-4000-8000-000000000001'
from public.wallets w where w.type = 'system';

insert into public.ledger_entries (transaction_id, wallet_id, amount, balance_after)
select '40000000-0000-4000-8000-000000000001'::uuid, w.id, -100.00, w.balance - 100.00 from public.wallets w where w.type = 'system'
union all
select '40000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-00000000000a'::uuid, 100.00, 100.00;

update public.wallets set balance = balance - 100.00 where type = 'system';

insert into public.audit_logs (user_id, action) values
  ('10000000-0000-4000-8000-00000000000a', 'test');

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- DB-01: exactly one System Treasury wallet, with no owner; a second one is rejected.
do $$
begin
  if (select count(*) from public.wallets where type = 'system' and user_id is null) <> 1 then
    raise exception 'DB-01 failed: expected exactly one System Treasury wallet';
  end if;
  perform pg_temp.expect_error('DB-01', 'owner',
    $q$insert into public.wallets (type) values ('system')$q$, '23505');
end $$;

-- DB-02: a user wallet can't go below zero; the System Treasury can.
do $$
begin
  perform pg_temp.expect_error('DB-02', 'owner',
    $q$update public.wallets set balance = -0.01 where id = '20000000-0000-4000-8000-00000000000a'$q$, '23514');
  if (select balance from public.wallets where type = 'system') >= 0 then
    raise exception 'DB-02 failed: System Treasury should be negative after funding a bonus';
  end if;
  -- wallet type and owner must match
  perform pg_temp.expect_error('DB-02', 'owner',
    $q$insert into public.wallets (type) values ('user')$q$, '23514');
end $$;

-- DB-03: transaction rules (amount > 0, not to self, unique idempotency key, reference format).
-- Note: numeric(12,2) rounds 10.555 to 10.56, so transfer_money (step 2) must reject
-- more than 2 decimals before storing.
do $$
declare
  v_treasury uuid := (select id from public.wallets where type = 'system');
  v_ref text;
begin
  perform pg_temp.expect_error('DB-03', 'owner', format(
    $q$insert into public.transactions (type, sender_wallet_id, receiver_wallet_id, amount, idempotency_key)
       values ('transfer', %L, '20000000-0000-4000-8000-00000000000a', 0, gen_random_uuid())$q$, v_treasury), '23514');
  perform pg_temp.expect_error('DB-03', 'owner', format(
    $q$insert into public.transactions (type, sender_wallet_id, receiver_wallet_id, amount, idempotency_key)
       values ('transfer', %L, '20000000-0000-4000-8000-00000000000a', -5, gen_random_uuid())$q$, v_treasury), '23514');
  perform pg_temp.expect_error('DB-03', 'owner',
    $q$insert into public.transactions (type, sender_wallet_id, receiver_wallet_id, amount, idempotency_key)
       values ('transfer', '20000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000a', 5, gen_random_uuid())$q$,
    '23514');
  perform pg_temp.expect_error('DB-03', 'owner', format(
    $q$insert into public.transactions (type, sender_wallet_id, receiver_wallet_id, amount, idempotency_key)
       values ('transfer', %L, '20000000-0000-4000-8000-00000000000a', 5, '50000000-0000-4000-8000-000000000001')$q$, v_treasury),
    '23505');

  select reference into v_ref from public.transactions where id = '40000000-0000-4000-8000-000000000001';
  if v_ref !~ '^TX-[0-9]{8}-[0-9]{6,}$' then
    raise exception 'DB-03 failed: reference % does not match TX-YYYYMMDD-000145', v_ref;
  end if;
end $$;

-- DB-04: one active device per user; binding a new one works after the old one is deactivated.
do $$
begin
  perform pg_temp.expect_error('DB-04', 'owner',
    $q$insert into public.devices (user_id, device_secret_hash) values ('10000000-0000-4000-8000-00000000000a', 'x')$q$,
    '23505');
  update public.devices set is_active = false where id = '30000000-0000-4000-8000-00000000000a';
  insert into public.devices (user_id, device_secret_hash) values ('10000000-0000-4000-8000-00000000000a', 'x');
end $$;

-- DB-05: ledger_entries and audit_logs are insert-only, even for the owner.
do $$
begin
  perform pg_temp.expect_error('DB-05', 'owner', $q$update public.ledger_entries set amount = 1$q$, '23001');
  perform pg_temp.expect_error('DB-05', 'owner', $q$delete from public.ledger_entries$q$, '23001');
  perform pg_temp.expect_error('DB-05', 'owner', $q$truncate public.ledger_entries$q$, '23001');
  perform pg_temp.expect_error('DB-05', 'owner', $q$update public.audit_logs set action = 'x'$q$, '23001');
  perform pg_temp.expect_error('DB-05', 'owner', $q$delete from public.audit_logs$q$, '23001');
  perform pg_temp.expect_error('DB-05', 'owner', $q$truncate public.audit_logs$q$, '23001');
end $$;

-- DB-06: phone rules: 9 digits, unique, required unless the account is deleted.
do $$
begin
  perform pg_temp.expect_error('DB-06', 'owner',
    $q$update public.app_users set phone = '12345' where id = '10000000-0000-4000-8000-00000000000a'$q$, '23514');
  perform pg_temp.expect_error('DB-06', 'owner',
    $q$update public.app_users set phone = null where id = '10000000-0000-4000-8000-00000000000a'$q$, '23514');
  perform pg_temp.expect_error('DB-06', 'owner',
    $q$update public.app_users set status = 'deleted' where id = '10000000-0000-4000-8000-00000000000a'$q$, '23514');
end $$;

-- DB-07: the auth user of a live account can't be removed (it would orphan the account).
do $$
begin
  perform pg_temp.expect_error('DB-07', 'owner',
    $q$delete from auth.users where id = '00000000-0000-4000-8000-00000000000a'$q$, '23514');
end $$;

-- DB-08: after deletion (status deleted, phone NULL, auth user removed) the number can register again.
do $$
begin
  update public.app_users set status = 'deleted', phone = null
  where id = '10000000-0000-4000-8000-00000000000a';
  delete from auth.users where id = '00000000-0000-4000-8000-00000000000a';

  if (select auth_user_id from public.app_users where id = '10000000-0000-4000-8000-00000000000a') is not null then
    raise exception 'DB-08 failed: auth_user_id should be NULL after the auth user is removed';
  end if;

  insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-00000000000c', 'test-a@users.garaadkaabe.invalid');
  insert into public.app_users (auth_user_id, phone) values
    ('00000000-0000-4000-8000-00000000000c', '690000001');
end $$;

-- DB-09: nothing new in public is readable or callable by the app unless granted on purpose.
do $$
begin
  create table public.zz_default_privileges_probe (id int);
  create function public.zz_default_privileges_probe() returns int language sql as 'select 1';

  if has_table_privilege('anon', 'public.zz_default_privileges_probe', 'select')
     or has_table_privilege('authenticated', 'public.zz_default_privileges_probe', 'select') then
    raise exception 'DB-09 failed: a new table is readable by anon/authenticated by default';
  end if;
  if has_function_privilege('anon', 'public.zz_default_privileges_probe()', 'execute')
     or has_function_privilege('authenticated', 'public.zz_default_privileges_probe()', 'execute') then
    raise exception 'DB-09 failed: a new function is callable by anon/authenticated by default';
  end if;
  if has_function_privilege('anon', 'private.current_app_user_id()', 'execute') then
    raise exception 'DB-09 failed: anon can call private.current_app_user_id()';
  end if;
end $$;

select 'DB-01..DB-09 passed' as result;

rollback;
