-- Scope change: the app is English only (SPEC.md 2.3).
--
-- Removes app_users.language. Notification texts are English only, so
-- private.notification_text() loses its language parameter, and the two functions
-- that looked up the recipient's language (transfer_money, grant_welcome_bonus) are
-- redefined without it. CREATE OR REPLACE keeps their existing grants.

-- ===========================================================================
-- English-only notification text
-- ===========================================================================

-- English matches design/screens/Notifications.dc.html.
create function private.notification_text(
  p_kind          text,
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
end;
$$;

revoke all on function private.notification_text(text, numeric, text, numeric)
from public, anon, authenticated;

-- ===========================================================================
-- Callers, without the language lookup (otherwise unchanged)
-- ===========================================================================

create or replace function public.transfer_money(
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

  -- 6. Notify both sides and audit.
  select u.phone into v_sender_phone
  from public.app_users u where u.id = v_user_id;

  select n.title, n.body into v_title, v_body
  from private.notification_text('sent', v_amount, p_receiver_phone, v_result.balance_after) n;
  insert into public.notifications (user_id, kind, title, body)
  values (v_user_id, 'sent', v_title, v_body);

  select n.title, n.body into v_title, v_body
  from private.notification_text('received', v_amount, v_sender_phone, null) n;
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

create or replace function public.grant_welcome_bonus(p_user_id uuid)
returns public.money_item
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status   text;
  v_wallet   uuid;
  v_treasury uuid;
  v_tx       uuid;
  v_created  boolean;
  v_title    text;
  v_body     text;
begin
  select u.status into v_status
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
  from private.notification_text('welcome', 100.00, null, null) n;
  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'welcome', v_title, v_body);

  insert into public.audit_logs (user_id, action, details)
  values (p_user_id, 'welcome_bonus', jsonb_build_object('transaction_id', v_tx));

  return private.money_item_for(v_tx, v_wallet);
end;
$$;

-- ===========================================================================
-- Remove the old function and the column
-- ===========================================================================

drop function private.notification_text(text, text, numeric, text, numeric);

-- Also removes the app_users_language_valid check and the column-level UPDATE grant
-- on language, so the app may now update only notifications_on (and read_at).
alter table public.app_users drop column language;
