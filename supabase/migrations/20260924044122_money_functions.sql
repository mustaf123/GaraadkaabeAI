-- Build step 2: moving money, receiver lookup, history and receipts
-- (CLAUDE.md §7.3, SPEC.md §8 and §10).
--
-- Errors are raised with the SPEC §11 code as the whole message ('E08', ...).
-- The app maps each code to its English / Somali text.
--
-- Public functions are SECURITY DEFINER (they run with the owner's rights, so they
-- can write the money tables the app can't touch) with search_path = '' and fully
-- qualified names. private.* helpers are only called from those functions.

-- ===========================================================================
-- Small helpers
-- ===========================================================================

-- 615552046 -> '61X XXX 2046' (the mockup format).
create function private.mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone ~ '^[0-9]{9}$' then substr(p_phone, 1, 2) || 'X XXX ' || substr(p_phone, 6, 4)
  end
$$;

-- 1234.5 -> '$1,234.50'
create function private.format_usd(p_amount numeric)
returns text
language sql
stable
set search_path = ''
as $$
  select '$' || to_char(p_amount, 'FM999,999,999,990.00')
$$;

-- Notification title and body in the recipient's language.
-- English matches design/screens/Notifications.dc.html.
create function private.notification_text(
  p_kind          text,
  p_language      text,
  p_amount        numeric,
  p_other_phone   text,
  p_balance_after numeric,
  out title       text,
  out body        text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_amount  text := private.format_usd(p_amount);
  v_other   text := private.mask_phone(p_other_phone);
  v_balance text := private.format_usd(p_balance_after);
begin
  if p_language = 'so' then
    -- Somali drafts: NEEDS REVIEW by a native speaker before release (SPEC §11).
    case p_kind
      when 'sent' then
        title := 'Lacag waa la diray';
        body  := format('Waxaad %s u dirtay %s. Haraaga cusub %s.', v_amount, v_other, v_balance);
      when 'received' then
        title := 'Lacag ayaa kuu timid';
        body  := format('Waxaad %s ka heshay %s.', v_amount, v_other);
      when 'welcome' then
        title := 'Ku soo dhawoow GaraadKaabeAI';
        body  := format('Boorsadaada waa diyaar, waxaana ku jira %s oo tijaabo ah.', v_amount);
    end case;
  else
    case p_kind
      when 'sent' then
        title := 'Money sent';
        body  := format('You sent %s to %s. New balance %s.', v_amount, v_other, v_balance);
      when 'received' then
        title := 'Money received';
        body  := format('You received %s from %s.', v_amount, v_other);
      when 'welcome' then
        title := 'Welcome to GaraadKaabeAI';
        body  := format('Your wallet is ready with a %s demo balance.', v_amount);
    end case;
  end if;
end;
$$;

-- ===========================================================================
-- Session check (server-side 60 s idle rule)
-- ===========================================================================

-- Every public function calls this first. It finds the caller's app_sessions row via
-- the login token's session_id claim, rejects it if revoked or idle for more than
-- 60 s (E11), rejects frozen (E10) / locked (E05) accounts, and refreshes last_seen.
create function private.require_session(out app_user_id uuid, out app_device_id uuid)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_status     text;
  v_session_id uuid;
begin
  select u.id, u.status into app_user_id, v_status
  from public.app_users u
  where u.auth_user_id = (select auth.uid());

  if app_user_id is null or v_status = 'deleted' then
    raise exception 'E11';
  end if;

  begin
    v_session_id := (auth.jwt() ->> 'session_id')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;

  update public.app_sessions s
  set last_seen = now()
  where s.auth_session_id = v_session_id
    and s.user_id = app_user_id
    and not s.revoked
    and s.last_seen >= now() - interval '60 seconds'
  returning s.device_id into app_device_id;

  if not found then
    raise exception 'E11';
  end if;
  if v_status = 'frozen' then
    raise exception 'E10';
  end if;
  if v_status = 'locked' then
    raise exception 'E05';
  end if;
end;
$$;

-- ===========================================================================
-- The one place money moves
-- ===========================================================================

-- Locks both wallets (lower id first, so two opposite transfers can't deadlock),
-- checks the balance, writes the transaction, two ledger lines and both balances.
-- If the idempotency key was committed by a parallel request while we waited for
-- the lock, nothing is written and o_created is false.
create function private.move_money(
  p_sender_wallet   uuid,
  p_receiver_wallet uuid,
  p_amount          numeric,
  p_type            text,
  p_idempotency_key uuid,
  out o_transaction_id uuid,
  out o_created        boolean
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_sender_type    text;
  v_sender_balance numeric(12, 2);
  v_sender_after   numeric(12, 2);
  v_receiver_after numeric(12, 2);
begin
  perform 1
  from public.wallets w
  where w.id in (p_sender_wallet, p_receiver_wallet)
  order by w.id
  for update;

  -- Re-check after locking: a double tap may have finished while we waited.
  select t.id into o_transaction_id
  from public.transactions t
  where t.idempotency_key = p_idempotency_key;
  if found then
    o_created := false;
    return;
  end if;

  select w.type, w.balance into v_sender_type, v_sender_balance
  from public.wallets w
  where w.id = p_sender_wallet;

  if v_sender_type = 'user' and v_sender_balance < p_amount then
    raise exception 'E08';
  end if;

  insert into public.transactions (type, sender_wallet_id, receiver_wallet_id, amount, idempotency_key)
  values (p_type, p_sender_wallet, p_receiver_wallet, p_amount, p_idempotency_key)
  returning id into o_transaction_id;

  update public.wallets set balance = balance - p_amount
  where id = p_sender_wallet
  returning balance into v_sender_after;

  update public.wallets set balance = balance + p_amount
  where id = p_receiver_wallet
  returning balance into v_receiver_after;

  insert into public.ledger_entries (transaction_id, wallet_id, amount, balance_after) values
    (o_transaction_id, p_sender_wallet,   -p_amount, v_sender_after),
    (o_transaction_id, p_receiver_wallet,  p_amount, v_receiver_after);

  o_created := true;
end;
$$;

-- ===========================================================================
-- Receipts
-- ===========================================================================

-- One transaction as seen by one wallet (NULL if that wallet isn't part of it).
create function private.money_item_for(p_transaction_id uuid, p_wallet_id uuid)
returns public.money_item
language sql
stable
set search_path = ''
as $$
  select
    t.id,
    t.reference,
    t.created_at,
    t.type,
    case when t.sender_wallet_id = p_wallet_id then 'sent' else 'received' end,
    t.amount,
    0.00::numeric(12, 2),
    private.mask_phone(u.phone),
    l.balance_after,
    t.status
  from public.transactions t
  join public.ledger_entries l
    on l.transaction_id = t.id and l.wallet_id = p_wallet_id
  left join public.wallets w
    on w.id = case when t.sender_wallet_id = p_wallet_id then t.receiver_wallet_id else t.sender_wallet_id end
  left join public.app_users u
    on u.id = w.user_id
  where t.id = p_transaction_id
$$;

-- A repeated idempotency key: return the first receipt, but only if the request is
-- the same (same sender, amount and receiver). Otherwise E15 "Request conflict".
create function private.replay_receipt(
  p_transaction_id uuid,
  p_sender_wallet  uuid,
  p_receiver_phone text,
  p_amount         numeric
)
returns public.money_item
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tx public.transactions%rowtype;
begin
  select * into v_tx from public.transactions t where t.id = p_transaction_id;

  if v_tx.sender_wallet_id is distinct from p_sender_wallet
     or v_tx.type <> 'transfer'
     or v_tx.amount <> p_amount
     or not exists (
       select 1
       from public.wallets w
       join public.app_users u on u.id = w.user_id
       where w.id = v_tx.receiver_wallet_id
         and u.phone = p_receiver_phone
     ) then
    raise exception 'E15';
  end if;

  return private.money_item_for(v_tx.id, p_sender_wallet);
end;
$$;

-- ===========================================================================
-- Public API (called by the app with the user's login token)
-- ===========================================================================

create function public.transfer_money(
  p_receiver_phone  text,
  p_amount          text,
  p_idempotency_key uuid
)
returns public.money_item
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id         uuid;
  v_device_id       uuid;
  v_amount          numeric(12, 2);
  v_sender_wallet   uuid;
  v_sender_phone    text;
  v_sender_language text;
  v_receiver        public.app_users%rowtype;
  v_receiver_wallet uuid;
  v_existing        uuid;
  v_tx              uuid;
  v_created         boolean;
  v_result          public.money_item;
  v_title           text;
  v_body            text;
begin
  -- 1. Live session, active account (E11 / E10 / E05).
  select s.app_user_id, s.app_device_id into v_user_id, v_device_id
  from private.require_session() s;

  -- 2. Amount, checked on the raw text before anything can round it:
  --    '10.555' must fail, not become 10.56 (E09).
  if p_amount is null or p_amount !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then
    raise exception 'E09';
  end if;
  v_amount := p_amount::numeric;
  if v_amount <= 0 then
    raise exception 'E09';
  end if;

  if p_receiver_phone is null or p_receiver_phone !~ '^[0-9]{9}$' then
    raise exception 'E01';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key is required' using errcode = '22004';
  end if;

  select w.id into v_sender_wallet from public.wallets w where w.user_id = v_user_id;

  -- 3. Key seen before: same request -> first receipt; different request -> E15.
  select t.id into v_existing from public.transactions t where t.idempotency_key = p_idempotency_key;
  if found then
    return private.replay_receipt(v_existing, v_sender_wallet, p_receiver_phone, v_amount);
  end if;

  -- 4. Receiver: registered, active, not the sender (E06 / E07).
  select * into v_receiver
  from public.app_users u
  where u.phone = p_receiver_phone and u.status = 'active';
  if not found then
    raise exception 'E06';
  end if;
  if v_receiver.id = v_user_id then
    raise exception 'E07';
  end if;
  select w.id into v_receiver_wallet from public.wallets w where w.user_id = v_receiver.id;

  -- 5. Lock, re-check the key, check the balance (E08), write.
  select m.o_transaction_id, m.o_created into v_tx, v_created
  from private.move_money(v_sender_wallet, v_receiver_wallet, v_amount, 'transfer', p_idempotency_key) m;

  if not v_created then
    return private.replay_receipt(v_tx, v_sender_wallet, p_receiver_phone, v_amount);
  end if;

  v_result := private.money_item_for(v_tx, v_sender_wallet);

  -- 6. Notify both sides (each in their own language) and audit.
  select u.phone, u.language into v_sender_phone, v_sender_language
  from public.app_users u where u.id = v_user_id;

  select n.title, n.body into v_title, v_body
  from private.notification_text('sent', v_sender_language, v_amount, p_receiver_phone, v_result.balance_after) n;
  insert into public.notifications (user_id, kind, title, body)
  values (v_user_id, 'sent', v_title, v_body);

  select n.title, n.body into v_title, v_body
  from private.notification_text('received', v_receiver.language, v_amount, v_sender_phone, null) n;
  insert into public.notifications (user_id, kind, title, body)
  values (v_receiver.id, 'received', v_title, v_body);

  insert into public.audit_logs (user_id, device_id, action, details)
  values (v_user_id, v_device_id, 'transfer', jsonb_build_object(
    'transaction_id', v_tx,
    'reference', v_result.reference,
    'amount', v_amount,
    'receiver_user_id', v_receiver.id
  ));

  return v_result;
end;
$$;

-- Send screen: confirms the receiver before the Confirm screen. Returns the masked
-- number, or E01 (bad format), E06 (not registered or not active), E07 (own number).
create function public.lookup_receiver(p_phone text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid;
  v_receiver uuid;
begin
  select s.app_user_id into v_user_id from private.require_session() s;

  if p_phone is null or p_phone !~ '^[0-9]{9}$' then
    raise exception 'E01';
  end if;

  select u.id into v_receiver
  from public.app_users u
  where u.phone = p_phone and u.status = 'active';

  if v_receiver is null then
    raise exception 'E06';
  end if;
  if v_receiver = v_user_id then
    raise exception 'E07';
  end if;

  return private.mask_phone(p_phone);
end;
$$;

-- History (and Home's last 3): newest first, with the other person's number masked.
-- Paging: pass the created_at and transaction_id of the last row you already have.
create function public.my_transactions(
  p_direction         text        default 'all',
  p_before_created_at timestamptz default null,
  p_before_id         uuid        default null,
  p_limit             integer     default 50
)
returns setof public.money_item
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_wallet  uuid;
begin
  select s.app_user_id into v_user_id from private.require_session() s;
  select w.id into v_wallet from public.wallets w where w.user_id = v_user_id;

  if p_direction is null or p_direction not in ('all', 'sent', 'received') then
    raise exception 'p_direction must be all, sent or received' using errcode = '22023';
  end if;

  return query
    select m.*
    from public.transactions t
    cross join lateral private.money_item_for(t.id, v_wallet) m
    where (t.sender_wallet_id = v_wallet or t.receiver_wallet_id = v_wallet)
      and (p_direction = 'all'
           or (p_direction = 'sent' and t.sender_wallet_id = v_wallet)
           or (p_direction = 'received' and t.receiver_wallet_id = v_wallet))
      and (p_before_created_at is null
           or (t.created_at, t.id) < (p_before_created_at,
                                      coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    order by t.created_at desc, t.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

-- Receipt screen opened from History. NULL if the transaction isn't the caller's.
create function public.get_receipt(p_transaction_id uuid)
returns public.money_item
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_wallet  uuid;
begin
  select s.app_user_id into v_user_id from private.require_session() s;
  select w.id into v_wallet from public.wallets w where w.user_id = v_user_id;

  return private.money_item_for(p_transaction_id, v_wallet);
end;
$$;

-- ===========================================================================
-- Server-only (service_role): the $100.00 demo balance
-- ===========================================================================

-- Called by auth-register (build step 3). Idempotent: a second call returns the
-- first bonus (and the unique index allows only one per wallet anyway).
create function public.grant_welcome_bonus(p_user_id uuid)
returns public.money_item
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status   text;
  v_language text;
  v_wallet   uuid;
  v_treasury uuid;
  v_tx       uuid;
  v_created  boolean;
  v_title    text;
  v_body     text;
begin
  select u.status, u.language into v_status, v_language
  from public.app_users u where u.id = p_user_id;
  if v_status is distinct from 'active' then
    raise exception 'welcome bonus: user % is not active', p_user_id using errcode = '22023';
  end if;

  select w.id into v_wallet from public.wallets w where w.user_id = p_user_id;
  if v_wallet is null then
    raise exception 'welcome bonus: user % has no wallet', p_user_id using errcode = '22023';
  end if;

  select t.id into v_tx
  from public.transactions t
  where t.receiver_wallet_id = v_wallet and t.type = 'welcome_bonus';
  if found then
    return private.money_item_for(v_tx, v_wallet);
  end if;

  select w.id into v_treasury from public.wallets w where w.type = 'system';

  select m.o_transaction_id, m.o_created into v_tx, v_created
  from private.move_money(v_treasury, v_wallet, 100.00, 'welcome_bonus', gen_random_uuid()) m;

  select n.title, n.body into v_title, v_body
  from private.notification_text('welcome', v_language, 100.00, null, null) n;
  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'welcome', v_title, v_body);

  insert into public.audit_logs (user_id, action, details)
  values (p_user_id, 'welcome_bonus', jsonb_build_object('transaction_id', v_tx));

  return private.money_item_for(v_tx, v_wallet);
end;
$$;

-- ===========================================================================
-- Privileges (everything is closed by default; see *_rls_and_grants.sql)
-- ===========================================================================

revoke all on function
  private.mask_phone(text),
  private.format_usd(numeric),
  private.notification_text(text, text, numeric, text, numeric),
  private.require_session(),
  private.move_money(uuid, uuid, numeric, text, uuid),
  private.money_item_for(uuid, uuid),
  private.replay_receipt(uuid, uuid, text, numeric)
from public, anon, authenticated;

revoke all on function
  public.transfer_money(text, text, uuid),
  public.lookup_receiver(text),
  public.my_transactions(text, timestamptz, uuid, integer),
  public.get_receipt(uuid),
  public.grant_welcome_bonus(uuid)
from public, anon, authenticated;

grant execute on function
  public.transfer_money(text, text, uuid),
  public.lookup_receiver(text),
  public.my_transactions(text, timestamptz, uuid, integer),
  public.get_receipt(uuid)
to authenticated;

grant execute on function public.grant_welcome_bonus(uuid) to service_role;
