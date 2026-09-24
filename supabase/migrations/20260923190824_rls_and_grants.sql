-- Row Level Security and privileges (CLAUDE.md §7.2, SPEC.md §9).
--
-- Supabase gives anon and authenticated full privileges on new tables in public,
-- and policies do not take those back. So: revoke everything, then grant back
-- only what the app needs. RLS then limits which rows those grants reach.

-- ---------------------------------------------------------------------------
-- 1. Start from zero
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

-- Future objects created by migrations are closed by default too.
-- Every new table or function must be granted explicitly.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- 2. RLS on every table
-- ---------------------------------------------------------------------------

alter table public.app_users        enable row level security;
alter table public.user_credentials enable row level security;
alter table public.devices          enable row level security;
alter table public.wallets          enable row level security;
alter table public.transactions     enable row level security;
alter table public.ledger_entries   enable row level security;
alter table public.notifications    enable row level security;
alter table public.app_sessions     enable row level security;
alter table public.audit_logs       enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Helpers used inside policies
-- ---------------------------------------------------------------------------

revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.current_app_user_id() to authenticated;
grant execute on function private.current_wallet_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. What a logged-in user may read (own rows only)
-- ---------------------------------------------------------------------------
-- No grants at all (server-only, via Edge Functions with service_role):
--   user_credentials, devices, app_sessions, audit_logs.
-- anon gets nothing anywhere.

grant select on public.app_users, public.wallets, public.transactions,
                public.ledger_entries, public.notifications
  to authenticated;

create policy "Users read their own profile"
  on public.app_users for select to authenticated
  using (id = (select private.current_app_user_id()));

create policy "Users read their own wallet"
  on public.wallets for select to authenticated
  using (user_id = (select private.current_app_user_id()));

create policy "Users read transactions they are part of"
  on public.transactions for select to authenticated
  using (
    sender_wallet_id = (select private.current_wallet_id())
    or receiver_wallet_id = (select private.current_wallet_id())
  );

create policy "Users read their own ledger lines"
  on public.ledger_entries for select to authenticated
  using (wallet_id = (select private.current_wallet_id()));

create policy "Users read their own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select private.current_app_user_id()));

-- ---------------------------------------------------------------------------
-- 5. What a logged-in user may change
-- ---------------------------------------------------------------------------
-- Column grants limit WHICH columns; the policies limit WHICH rows.
-- Without the column grants a user could, e.g., unfreeze their own account.

grant update (language, notifications_on) on public.app_users to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "Users update their own preferences"
  on public.app_users for update to authenticated
  using (id = (select private.current_app_user_id()))
  with check (id = (select private.current_app_user_id()));

create policy "Users mark their own notifications read"
  on public.notifications for update to authenticated
  using (user_id = (select private.current_app_user_id()))
  with check (user_id = (select private.current_app_user_id()));

-- No INSERT or DELETE for clients anywhere. Money changes go through
-- transfer_money() (build step 2); everything else through Edge Functions.
