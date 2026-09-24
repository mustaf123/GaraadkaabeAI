-- Fix: a transfer could pay a wallet whose owner deleted (or froze) the account
-- while the transfer waited for the wallet lock.
--
-- transfer_money checks the receiver (step 4) before locking (step 5). If the
-- receiver deletes their account in between, the transfer would still credit the
-- deleted wallet and the money would be stuck there. move_money now re-checks the
-- receiver after locking. account-delete locks the same wallet before it checks the
-- balance, so one of the two always sees the other's result.

create or replace function private.move_money(
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

  -- Re-check after locking: the receiver may have been deleted or frozen while we waited.
  if p_type = 'transfer' and not exists (
    select 1
    from public.wallets w
    join public.app_users u on u.id = w.user_id
    where w.id = p_receiver_wallet
      and u.status = 'active'
  ) then
    raise exception 'E06';
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
