-- GaraadKaabeAI schema (CLAUDE.md §7.1, SPEC.md §9).
-- Money is numeric(12,2), never float. RLS and grants live in *_rls_and_grants.sql.

-- Helpers that must not be reachable through the Data API.
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

-- Profile data the app may read. Secrets live in user_credentials.
create table public.app_users (
  id               uuid primary key default gen_random_uuid(),
  -- NULL only after account deletion (the auth user is removed then).
  auth_user_id     uuid unique references auth.users (id) on delete set null,
  -- 9 digits after +252, e.g. 615552046. Set to NULL on delete so the number can register again.
  phone            text unique,
  status           text not null default 'active',
  language         text not null default 'en',
  notifications_on boolean not null default true,
  created_at       timestamptz not null default now(),

  constraint app_users_status_valid check (status in ('active', 'locked', 'frozen', 'deleted')),
  constraint app_users_language_valid check (language in ('en', 'so')),
  constraint app_users_phone_format check (phone ~ '^[0-9]{9}$'),
  constraint app_users_phone_null_only_when_deleted check ((phone is null) = (status = 'deleted')),
  constraint app_users_auth_user_required check (auth_user_id is not null or status = 'deleted')
);

-- PIN / recovery hashes and lock counters. Never readable by the app:
-- a 4-digit PIN hash can be brute-forced offline, which would skip the lockout.
create table public.user_credentials (
  user_id               uuid primary key references public.app_users (id) on delete cascade,
  pin_hash              text not null,
  recovery_hash         text not null,
  failed_pin_count      smallint not null default 0 check (failed_pin_count >= 0),
  lockout_count         smallint not null default 0 check (lockout_count >= 0),
  locked_until          timestamptz,
  recovery_failed_count smallint not null default 0 check (recovery_failed_count >= 0),
  recovery_locked_until timestamptz,
  updated_at            timestamptz not null default now()
);

create table public.devices (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.app_users (id),
  device_secret_hash    text not null,
  biometric_secret_hash text,
  -- Expo push token: the phone's delivery address for push notifications.
  push_token            text,
  name                  text check (char_length(name) <= 100),
  is_active             boolean not null default true,
  bound_at              timestamptz not null default now()
);

-- At most one active device per user.
create unique index devices_one_active_per_user on public.devices (user_id) where is_active;

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

create table public.wallets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references public.app_users (id),
  type       text not null,
  -- Cached for speed; must always equal the sum of this wallet's ledger lines.
  balance    numeric(12, 2) not null default 0,
  currency   text not null default 'USD',
  created_at timestamptz not null default now(),

  constraint wallets_type_valid check (type in ('user', 'system')),
  constraint wallets_currency_valid check (currency = 'USD'),
  constraint wallets_owner_matches_type check ((type = 'user') = (user_id is not null)),
  -- Only the System Treasury may go below zero (it funds the demo balances).
  constraint wallets_balance_non_negative check (type = 'system' or balance >= 0)
);

-- Exactly one System Treasury wallet.
create unique index wallets_one_system on public.wallets (type) where type = 'system';

create sequence public.transaction_reference_seq;

create table public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  -- e.g. TX-20260923-000145 (date in Somalia time).
  reference          text not null unique default (
                       'TX-' || to_char(now() at time zone 'Africa/Mogadishu', 'YYYYMMDD')
                       || '-' || lpad(nextval('public.transaction_reference_seq')::text, 6, '0')
                     ),
  type               text not null,
  sender_wallet_id   uuid not null references public.wallets (id),
  receiver_wallet_id uuid not null references public.wallets (id),
  amount             numeric(12, 2) not null,
  -- A transfer is all-or-nothing, so only completed rows are ever written.
  status             text not null default 'completed',
  idempotency_key    uuid not null unique,
  created_at         timestamptz not null default now(),

  constraint transactions_type_valid check (type in ('transfer', 'welcome_bonus')),
  constraint transactions_status_valid check (status = 'completed'),
  constraint transactions_amount_positive check (amount > 0),
  constraint transactions_not_to_self check (sender_wallet_id <> receiver_wallet_id)
);

create index transactions_sender_created on public.transactions (sender_wallet_id, created_at desc);
create index transactions_receiver_created on public.transactions (receiver_wallet_id, created_at desc);

-- Double-entry ledger: two lines per transaction that sum to zero. Insert-only.
create table public.ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id),
  wallet_id      uuid not null references public.wallets (id),
  amount         numeric(12, 2) not null check (amount <> 0),
  created_at     timestamptz not null default now()
);

create index ledger_entries_wallet_created on public.ledger_entries (wallet_id, created_at);
create index ledger_entries_transaction on public.ledger_entries (transaction_id);

-- ---------------------------------------------------------------------------
-- Notifications, sessions, audit
-- ---------------------------------------------------------------------------

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.app_users (id),
  kind       text not null,
  title      text not null,
  body       text not null,
  read_at    timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_kind_valid check (kind in ('sent', 'received', 'security', 'welcome'))
);

create index notifications_user_created on public.notifications (user_id, created_at desc);

-- Server-side 60-second idle rule (CLAUDE.md §7.3 step 1).
create table public.app_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.app_users (id),
  device_id  uuid not null references public.devices (id),
  last_seen  timestamptz not null default now(),
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);

create index app_sessions_user_open on public.app_sessions (user_id) where not revoked;

-- Insert-only. user_id is NULL for events without a known user (e.g. login with an unknown number).
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.app_users (id),
  device_id  uuid references public.devices (id),
  action     text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_user_created on public.audit_logs (user_id, created_at);

-- ---------------------------------------------------------------------------
-- Helpers used by RLS policies
-- ---------------------------------------------------------------------------

-- The caller's app_users.id, or NULL if not logged in or the account is deleted.
create function private.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.app_users u
  where u.auth_user_id = (select auth.uid())
    and u.status <> 'deleted'
$$;

-- The caller's wallet id, or NULL.
create function private.current_wallet_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id
  from public.wallets w
  where w.user_id = private.current_app_user_id()
$$;
