-- 06: money is never created or lost. Covers TC-36 (SPEC.md §12, NFR-01).
-- Runs a chain of transfers (including failed ones), then checks the rules over ALL
-- data in the database, not just this file's: real data and data left by
-- scripts/test-concurrency.mjs must pass too.
-- Run with `npm run test:db`. Everything runs in one transaction and is rolled back.

begin;

-- ---------------------------------------------------------------------------
-- Test helpers (live in pg_temp, gone after the rollback)
-- ---------------------------------------------------------------------------

create function pg_temp.act_as(p_actor text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated', 'session_id', p_actor)::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.check(p_label text, p_ok boolean, p_what text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception '% failed: %', p_label, p_what;
  end if;
end $$;

create function pg_temp.make_user(p_auth uuid, p_phone text) returns uuid
language plpgsql as $$
declare
  v_user   uuid;
  v_device uuid;
begin
  insert into auth.users (id, email) values (p_auth, p_phone || '@users.garaadkaabe.invalid');
  insert into public.app_users (auth_user_id, phone) values (p_auth, p_phone) returning id into v_user;
  insert into public.user_credentials (user_id, pin_hash, recovery_hash) values (v_user, 'test-hash', 'test-hash');
  insert into public.devices (user_id, device_secret_hash) values (v_user, 'test-hash') returning id into v_device;
  insert into public.wallets (user_id, type) values (v_user, 'user');
  insert into public.app_sessions (user_id, device_id, auth_session_id) values (v_user, v_device, p_auth);
  perform public.grant_welcome_bonus(v_user);
  return v_user;
end $$;

-- A transfer that may fail (E08 etc.); failures are swallowed so the chain continues.
create function pg_temp.try_send(p_actor text, p_phone text, p_amount text) returns boolean
language plpgsql as $$
begin
  perform pg_temp.act_as(p_actor);
  begin
    perform public.transfer_money(p_phone, p_amount, gen_random_uuid());
  exception when others then
    execute 'reset role';
    return false;
  end;
  execute 'reset role';
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: A, B, C with $100.00 each, then 30 transfers in a ring with odd amounts.
-- Some are bound to fail with E08; that must leave no trace either.
-- ---------------------------------------------------------------------------

select pg_temp.make_user('00000000-0000-4000-8000-00000000000a', '690000001');
select pg_temp.make_user('00000000-0000-4000-8000-00000000000b', '690000002');
select pg_temp.make_user('00000000-0000-4000-8000-00000000000c', '690000003');

do $$
declare
  v_actors text[] := array['00000000-0000-4000-8000-00000000000a',
                           '00000000-0000-4000-8000-00000000000b',
                           '00000000-0000-4000-8000-00000000000c'];
  v_phones text[] := array['690000002', '690000003', '690000001'];
  v_ok int := 0;
  v_failed int := 0;
begin
  for i in 1..30 loop
    if pg_temp.try_send(v_actors[(i % 3) + 1], v_phones[(i % 3) + 1], to_char(i * 13.37, 'FM9990.00')) then
      v_ok := v_ok + 1;
    else
      v_failed := v_failed + 1;
    end if;
  end loop;
  perform pg_temp.check('TC-36', v_ok > 0 and v_failed > 0,
    format('fixture should mix successes and E08 failures (ok %s, failed %s)', v_ok, v_failed));
end $$;

-- ---------------------------------------------------------------------------
-- Checks (over the whole database)
-- ---------------------------------------------------------------------------

-- TC-36a: the ledger sums to exactly zero.
do $$
declare
  v_sum numeric := (select coalesce(sum(amount), 0) from public.ledger_entries);
begin
  perform pg_temp.check('TC-36', v_sum = 0, format('SUM(ledger_entries.amount) = %s, expected 0', v_sum));
end $$;

-- TC-36b: every wallet's cached balance equals the sum of its ledger lines.
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s: balance %s, ledger %s', w.id, w.balance, coalesce(l.total, 0)), '; ')
  into v_bad
  from public.wallets w
  left join (select wallet_id, sum(amount) as total from public.ledger_entries group by wallet_id) l
    on l.wallet_id = w.id
  where w.balance <> coalesce(l.total, 0);
  perform pg_temp.check('TC-36', v_bad is null, format('balance differs from ledger: %s', v_bad));
end $$;

-- TC-36c: every transaction has exactly two lines: -amount on the sender, +amount on the receiver.
do $$
declare
  v_bad bigint;
begin
  select count(*) into v_bad
  from public.transactions t
  where (select count(*) from public.ledger_entries l where l.transaction_id = t.id) <> 2
     or not exists (select 1 from public.ledger_entries l
                    where l.transaction_id = t.id and l.wallet_id = t.sender_wallet_id and l.amount = -t.amount)
     or not exists (select 1 from public.ledger_entries l
                    where l.transaction_id = t.id and l.wallet_id = t.receiver_wallet_id and l.amount = t.amount);
  perform pg_temp.check('TC-36', v_bad = 0, format('%s transactions without a matching pair of ledger lines', v_bad));
end $$;

-- TC-36d: balance_after is the running total of each wallet's ledger, and the last
-- one equals the wallet's balance.
do $$
declare
  v_bad bigint;
begin
  select count(*) into v_bad
  from (
    select l.balance_after,
           sum(l.amount) over (partition by l.wallet_id order by l.seq) as running
    from public.ledger_entries l
  ) x
  where x.balance_after <> x.running;
  perform pg_temp.check('TC-36', v_bad = 0, format('%s ledger lines with a wrong balance_after', v_bad));

  select count(*) into v_bad
  from public.wallets w
  join lateral (select l.balance_after from public.ledger_entries l
                where l.wallet_id = w.id order by l.seq desc limit 1) last on true
  where last.balance_after <> w.balance;
  perform pg_temp.check('TC-36', v_bad = 0, format('%s wallets whose last balance_after is not the balance', v_bad));
end $$;

-- TC-36e: only the System Treasury is ever below zero.
do $$
begin
  perform pg_temp.check('TC-36',
    not exists (select 1 from public.wallets where type = 'user' and balance < 0)
    and not exists (select 1 from public.ledger_entries l join public.wallets w on w.id = l.wallet_id
                    where w.type = 'user' and l.balance_after < 0),
    'a user wallet went below zero');
end $$;

select 'TC-36 passed' as result;

rollback;
