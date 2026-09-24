-- Build step 3: a PIN lock reached while logged in ends that session.
--
-- Change PIN and Enable fingerprint ask for the PIN again inside a live session.
-- When a wrong PIN there locks the login (or the login is already locked), the
-- Edge Function calls this before answering E05, so the phone that was guessing
-- can't keep sending money until the 60 s idle timeout. For the app, E05 on a
-- logged-in screen always means "you are logged out".
--
-- Unlike auth_logout (the Log out button) this keeps the device's push token: it
-- is an automatic logout, so the phone keeps receiving pushes (CLAUDE.md §7.5).

create function public.auth_end_session(p_auth_session_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user   uuid;
  v_device uuid;
begin
  if p_reason not in ('pin_locked') then
    raise exception 'unknown reason %', p_reason using errcode = '22023';
  end if;

  update public.app_sessions s set revoked = true
  where s.auth_session_id = p_auth_session_id and not s.revoked
  returning s.user_id, s.device_id into v_user, v_device;

  if v_device is not null then
    insert into public.audit_logs (user_id, device_id, action, details)
    values (v_user, v_device, 'session_ended', jsonb_build_object('reason', p_reason));
  end if;
end;
$$;

revoke all on function public.auth_end_session(uuid, text) from public, anon, authenticated;
grant execute on function public.auth_end_session(uuid, text) to service_role;
