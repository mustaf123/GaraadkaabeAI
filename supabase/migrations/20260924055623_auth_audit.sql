-- Build step 3, auth-login: an audit row for events that happen outside the other
-- auth functions, e.g. a login with a number nobody uses (user_id NULL).
-- details must never hold a PIN, recovery code, secret or token (CLAUDE.md §7.4).

create function public.auth_audit(
  p_user_id   uuid,
  p_device_id uuid,
  p_action    text,
  p_details   jsonb default null
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_logs (user_id, device_id, action, details)
  values (p_user_id, p_device_id, p_action, coalesce(p_details, '{}'::jsonb))
$$;

revoke all on function public.auth_audit(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.auth_audit(uuid, uuid, text, jsonb) to service_role;
