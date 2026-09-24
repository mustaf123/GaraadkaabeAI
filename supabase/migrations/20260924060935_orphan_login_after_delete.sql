-- account-delete: if removing the auth user fails after auth_delete_account, the
-- deleted app_users row still points at that login, so the old auth_orphan_login
-- didn't count it as leftover and re-registering the number answered E18.
-- A login is leftover when no LIVE (not deleted) account uses it. auth-register then
-- removes it, which the database allows because its account is deleted.

create or replace function public.auth_orphan_login(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select au.id
  from auth.users au
  where au.email = p_email
    and au.created_at < now() - interval '1 minute'
    and not exists (
      select 1 from public.app_users u
      where u.auth_user_id = au.id and u.status <> 'deleted'
    )
$$;

-- create or replace keeps the privileges; stated again so this file is complete.
revoke all on function public.auth_orphan_login(text) from public, anon, authenticated;
grant execute on function public.auth_orphan_login(text) to service_role;
