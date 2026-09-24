-- Build step 2: columns and types needed by the money functions.

-- Link our session row to the Supabase login token's `session_id` claim,
-- so transfer_money can find the caller's session and enforce the 60 s idle rule.
-- (auth-login / auth-register write it in build step 3.)
alter table public.app_sessions add column auth_session_id uuid not null unique;

create index app_sessions_device on public.app_sessions (device_id);

-- The wallet balance right after each ledger line (receipt "New balance", History),
-- and a strictly increasing number that gives ledger lines an exact order.
alter table public.ledger_entries add column balance_after numeric(12, 2) not null;
alter table public.ledger_entries add column seq bigint generated always as identity unique;

-- At most one welcome bonus per wallet, guaranteed by the database.
create unique index transactions_one_welcome_bonus
  on public.transactions (receiver_wallet_id) where type = 'welcome_bonus';

-- One money movement as seen by one wallet. Returned by transfer_money,
-- my_transactions, get_receipt and grant_welcome_bonus.
create type public.money_item as (
  transaction_id      uuid,
  reference           text,
  created_at          timestamptz,
  type                text,           -- transfer | welcome_bonus
  direction           text,           -- sent | received
  amount              numeric(12, 2),
  fee                 numeric(12, 2), -- always 0.00
  counterparty_masked text,           -- e.g. 61X XXX 2046; NULL for the welcome bonus or a deleted account
  balance_after       numeric(12, 2),
  status              text
);
