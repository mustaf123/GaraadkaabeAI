-- 02: the app (anon or logged in) can't write to money tables or server-only tables,
-- and can change only the columns it is allowed to. Covers TC-18 (SPEC.md §12).
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
      json_build_object('sub', p_actor, 'role', 'authenticated', 'session_id', p_actor)::text, true);
    execute 'set local role authenticated';
  end if;
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

-- ---------------------------------------------------------------------------
-- Fixtures: user A with a wallet, a welcome bonus and a notification.
--   auth A = 00000000-0000-4000-8000-00000000000a
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
       '20000000-0000-4000-8000-00000000000a', 100.00, gen_random_uuid()
from public.wallets w where w.type = 'system';

insert into public.ledger_entries (transaction_id, wallet_id, amount, balance_after)
select '40000000-0000-4000-8000-000000000001'::uuid, w.id, -100.00, w.balance - 100.00 from public.wallets w where w.type = 'system'
union all
select '40000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-00000000000a'::uuid, 100.00, 100.00;

update public.wallets set balance = balance - 100.00 where type = 'system';

insert into public.notifications (user_id, kind, title, body) values
  ('10000000-0000-4000-8000-00000000000a', 'welcome', 'Welcome', 'You received $100.00');

insert into public.app_sessions (user_id, device_id, auth_session_id) values
  ('10000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a');

insert into public.audit_logs (user_id, action) values
  ('10000000-0000-4000-8000-00000000000a', 'test');

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- TC-18: no INSERT, UPDATE, DELETE or TRUNCATE on money tables, neither with the
-- anon key nor as a logged-in user (even on the user's own wallet).
do $$
declare
  v_table text;
  v_actor text;
begin
  foreach v_table in array array['wallets', 'transactions', 'ledger_entries'] loop
    foreach v_actor in array array['anon', '00000000-0000-4000-8000-00000000000a'] loop
      perform pg_temp.expect_error('TC-18', v_actor,
        format('insert into public.%I default values', v_table), '42501');
      perform pg_temp.expect_error('TC-18', v_actor,
        format('update public.%I set created_at = now()', v_table), '42501');
      perform pg_temp.expect_error('TC-18', v_actor,
        format('delete from public.%I', v_table), '42501');
      perform pg_temp.expect_error('TC-18', v_actor,
        format('truncate public.%I', v_table), '42501');
    end loop;
  end loop;

  perform pg_temp.expect_error('TC-18', '00000000-0000-4000-8000-00000000000a',
    $q$update public.wallets set balance = 1000000 where id = '20000000-0000-4000-8000-00000000000a'$q$, '42501');
end $$;

-- DB-10: no INSERT or DELETE on any other table either; server-only tables can't be updated.
do $$
declare
  v_table text;
  v_actor text;
begin
  foreach v_table in array array['app_users', 'user_credentials', 'devices', 'notifications',
                                 'app_sessions', 'audit_logs'] loop
    foreach v_actor in array array['anon', '00000000-0000-4000-8000-00000000000a'] loop
      perform pg_temp.expect_error('DB-10', v_actor,
        format('insert into public.%I default values', v_table), '42501');
      perform pg_temp.expect_error('DB-10', v_actor,
        format('delete from public.%I', v_table), '42501');
    end loop;
  end loop;

  foreach v_table in array array['user_credentials', 'devices', 'app_sessions', 'audit_logs'] loop
    foreach v_actor in array array['anon', '00000000-0000-4000-8000-00000000000a'] loop
      perform pg_temp.expect_error('DB-10', v_actor,
        format('update public.%I set user_id = user_id', v_table), '42501');
    end loop;
  end loop;
end $$;

-- DB-11: on their own rows, a user may change only notifications_on and read_at.
do $$
declare
  v_col text;
  a constant text := '00000000-0000-4000-8000-00000000000a';
begin
  foreach v_col in array array['status', 'phone', 'auth_user_id', 'created_at'] loop
    perform pg_temp.expect_error('DB-11', a,
      format('update public.app_users set %I = %I', v_col, v_col), '42501');
  end loop;
  foreach v_col in array array['user_id', 'kind', 'title', 'body', 'created_at'] loop
    perform pg_temp.expect_error('DB-11', a,
      format('update public.notifications set %I = %I', v_col, v_col), '42501');
  end loop;

  if pg_temp.exec_as(a, $q$update public.app_users set notifications_on = false$q$) <> 1 then
    raise exception 'DB-11 failed: user could not update their own notifications_on';
  end if;
  if pg_temp.exec_as(a, $q$update public.notifications set read_at = now()$q$) <> 1 then
    raise exception 'DB-11 failed: user could not mark their own notification read';
  end if;

  -- English only: there is no language column any more (42703 = undefined column).
  perform pg_temp.expect_error('DB-11', a, $q$update public.app_users set language = 'so'$q$, '42703');

  -- anon can't update anything
  perform pg_temp.expect_error('DB-11', 'anon', $q$update public.app_users set notifications_on = false$q$, '42501');
  perform pg_temp.expect_error('DB-11', 'anon', $q$update public.notifications set read_at = now()$q$, '42501');
end $$;

select 'TC-18 passed; DB-10, DB-11 passed' as result;

rollback;
