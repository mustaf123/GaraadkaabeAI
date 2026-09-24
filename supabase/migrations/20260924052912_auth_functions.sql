-- Build step 3: database side of the auth Edge Functions (CLAUDE.md §7.4, SPEC.md §6).
--
-- An Edge Function can't wrap several database calls in one transaction, so every
-- multi-step change is one function here (all or nothing, with row locks).
-- They are SECURITY DEFINER with search_path = '' like the money functions, and
-- executable by service_role ONLY: the app can never call them.
--
-- Hashes arrive already made by the Edge Function (bcrypt for PIN / recovery code,
-- SHA-256 for device and biometric secrets). Nothing here sees a raw secret.
-- Errors use the SPEC §11 code as the whole message, like transfer_money.

-- ===========================================================================
-- Schema
-- ===========================================================================

-- When a new phone took over this device's account (7-day "This wasn't me" window).
alter table public.devices add column replaced_at timestamptz;

-- account-freeze finds the old phone by the hash of its device secret.
create index devices_secret_hash on public.devices (device_secret_hash);

-- ===========================================================================
-- Helpers (private, not reachable through the Data API)
-- ===========================================================================

-- Security alert texts (kind = 'security'). Style of design/screens/Notifications.dc.html.
create function private.security_text(p_event text, out title text, out body text)
language plpgsql
immutable
set search_path = ''
as $$
begin
  case p_event
    when 'new_device' then
      title := 'New login';
      body  := 'Your account was opened on another phone. If this wasn''t you, tap "This wasn''t me".';
    when 'frozen' then
      title := 'Account frozen';
      body  := 'Your account was frozen after "This wasn''t me". Use Forgot PIN to unlock it.';
    when 'pin_reset' then
      title := 'PIN reset';
      body  := 'Your PIN was reset with your recovery code. You have a new recovery code.';
    when 'pin_changed' then
      title := 'PIN changed';
      body  := 'Your PIN was changed.';
    when 'biometric_on' then
      title := 'Fingerprint login turned on';
      body  := 'You can now log in with your fingerprint or your PIN.';
    when 'biometric_off' then
      title := 'Fingerprint login turned off';
      body  := 'You can now log in with your PIN only.';
  end case;
end;
$$;

create function private.notify_security(p_user_id uuid, p_event text)
returns void
language sql
volatile
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body)
  select p_user_id, 'security', t.title, t.body
  from private.security_text(p_event) t
$$;

-- The session check shared by transfer_money & co. (via require_session) and the
-- Edge Functions (via auth_check_session). Same rules everywhere: the session row
-- exists, is not revoked and was seen in the last 60 s (else E11); frozen -> E10;
-- locked -> E05. Refreshes last_seen.
create function private.require_session_for(
  p_auth_user_id uuid,
  p_session_id   uuid,
  out app_user_id   uuid,
  out app_device_id uuid
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_status text;
begin
  select u.id, u.status into app_user_id, v_status
  from public.app_users u
  where u.auth_user_id = p_auth_user_id;

  if app_user_id is null or v_status = 'deleted' then
    raise exception 'E11';
  end if;

  update public.app_sessions s
  set last_seen = now()
  where s.auth_session_id = p_session_id
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

-- Same behaviour as before; the rules now live in require_session_for.
create or replace function private.require_session(out app_user_id uuid, out app_device_id uuid)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  begin
    v_session_id := (auth.jwt() ->> 'session_id')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;

  select s.app_user_id, s.app_device_id into app_user_id, app_device_id
  from private.require_session_for((select auth.uid()), v_session_id) s;
end;
$$;

-- Lock after 3 failures. PIN: 30 min, or 24 h from the 3rd lockout on.
-- Recovery code: 24 h. The caller holds the user_credentials row lock.
create function private.apply_lock(p_user_id uuid, p_kind text)
returns timestamptz
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_until timestamptz;
begin
  if p_kind = 'pin' then
    update public.user_credentials c
    set lockout_count = c.lockout_count + 1,
        locked_until  = now() + case when c.lockout_count + 1 >= 3 then interval '24 hours'
                                     else interval '30 minutes' end,
        updated_at    = now()
    where c.user_id = p_user_id
    returning c.locked_until into v_until;
  else
    update public.user_credentials c
    set recovery_locked_until = now() + interval '24 hours',
        updated_at            = now()
    where c.user_id = p_user_id
    returning c.recovery_locked_until into v_until;
  end if;

  insert into public.audit_logs (user_id, action, details)
  values (p_user_id, p_kind || '_locked', jsonb_build_object('locked_until', v_until));

  return v_until;
end;
$$;

-- ===========================================================================
-- Lookups and sessions
-- ===========================================================================

-- auth-check-phone: is this number registered (any status except deleted)?
create function public.auth_phone_registered(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_users u where u.phone = p_phone)
$$;

-- Everything a login function needs about one number. user_id is NULL if the
-- number is not registered. device_* describe the ACTIVE device (NULL if none).
create function public.auth_lookup(
  p_phone text,
  out user_id               uuid,
  out auth_user_id          uuid,
  out status                text,
  out pin_hash              text,
  out recovery_hash         text,
  out locked_until          timestamptz,
  out recovery_locked_until timestamptz,
  out device_id             uuid,
  out device_secret_hash    text,
  out biometric_secret_hash text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select u.id, u.auth_user_id, u.status, c.pin_hash, c.recovery_hash, c.locked_until,
         c.recovery_locked_until, d.id, d.device_secret_hash, d.biometric_secret_hash
  into user_id, auth_user_id, status, pin_hash, recovery_hash, locked_until,
       recovery_locked_until, device_id, device_secret_hash, biometric_secret_hash
  from public.app_users u
  join public.user_credentials c on c.user_id = u.id
  left join public.devices d on d.user_id = u.id and d.is_active
  where u.phone = p_phone;
end;
$$;

-- For functions called with a user token: the caller's app user and device, after
-- the same session rules as transfer_money (E11 / E10 / E05).
create function public.auth_check_session(
  p_auth_user_id uuid,
  p_session_id   uuid,
  out app_user_id   uuid,
  out app_device_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  select s.app_user_id, s.app_device_id into app_user_id, app_device_id
  from private.require_session_for(p_auth_user_id, p_session_id) s;
end;
$$;

-- A new login: one open session per user, so every other open session is revoked.
create function public.auth_open_session(
  p_user_id         uuid,
  p_device_id       uuid,
  p_auth_session_id uuid,
  p_method          text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_method not in ('register', 'pin', 'biometric', 'reset') then
    raise exception 'unknown login method %', p_method using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.devices d where d.id = p_device_id and d.user_id = p_user_id and d.is_active
  ) then
    raise exception 'device % is not the active device of user %', p_device_id, p_user_id
      using errcode = '22023';
  end if;

  update public.app_sessions s set revoked = true
  where s.user_id = p_user_id and not s.revoked;

  insert into public.app_sessions (user_id, device_id, auth_session_id)
  values (p_user_id, p_device_id, p_auth_session_id);

  insert into public.audit_logs (user_id, device_id, action, details)
  values (p_user_id, p_device_id, 'login', jsonb_build_object('method', p_method));
end;
$$;

-- auth-logout (the Log out button): revoke this session and clear the device's push
-- token. Automatic logouts never call this, so a closed app keeps receiving pushes.
create function public.auth_logout(p_auth_session_id uuid)
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
  update public.app_sessions s set revoked = true
  where s.auth_session_id = p_auth_session_id
  returning s.user_id, s.device_id into v_user, v_device;

  if v_device is not null then
    update public.devices d set push_token = null where d.id = v_device;
    insert into public.audit_logs (user_id, device_id, action)
    values (v_user, v_device, 'logout');
  end if;
end;
$$;

-- ===========================================================================
-- Registration
-- ===========================================================================

-- auth-register, after the auth user exists: every row of a new account plus the
-- $100.00 welcome bonus, in ONE transaction. E01 bad number, E18 already registered.
create function public.auth_register_user(
  p_auth_user_id       uuid,
  p_phone              text,
  p_pin_hash           text,
  p_recovery_hash      text,
  p_device_secret_hash text,
  p_device_name        text,
  out user_id   uuid,
  out device_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_phone is null or p_phone !~ '^[0-9]{9}$' then
    raise exception 'E01';
  end if;

  begin
    insert into public.app_users (auth_user_id, phone)
    values (p_auth_user_id, p_phone)
    returning id into user_id;
  exception when unique_violation then
    raise exception 'E18';
  end;

  insert into public.user_credentials (user_id, pin_hash, recovery_hash)
  values (user_id, p_pin_hash, p_recovery_hash);

  insert into public.devices (user_id, device_secret_hash, name)
  values (user_id, p_device_secret_hash, left(p_device_name, 100))
  returning id into device_id;

  insert into public.wallets (user_id, type) values (user_id, 'user');

  perform public.grant_welcome_bonus(user_id);

  insert into public.audit_logs (user_id, device_id, action)
  values (user_id, device_id, 'register');
end;
$$;

-- An auth user whose internal email no live account uses: left over from a crash
-- between "create auth user" and auth_register_user, or from a failed auth-user
-- delete. Older than a minute, so a registration still in progress is left alone.
create function public.auth_orphan_login(p_email text)
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
    and not exists (select 1 from public.app_users u where u.auth_user_id = au.id)
$$;

-- ===========================================================================
-- PIN and recovery-code attempts
-- ===========================================================================

-- Call BEFORE checking a hash. The attempt is counted first, so 100 guesses sent at
-- the same moment can't all get past the limit. allowed = false: locked until
-- locked_until. An attempt whose function crashed stays counted (fails closed).
-- p_kind: 'pin' (3 tries -> 30 min / 24 h) or 'recovery' (3 tries -> 24 h).
create function public.auth_attempt_begin(
  p_user_id uuid,
  p_kind    text,
  out allowed      boolean,
  out locked_until timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.user_credentials%rowtype;
  v_count smallint;
  v_until timestamptz;
begin
  if p_kind not in ('pin', 'recovery') then
    raise exception 'unknown attempt kind %', p_kind using errcode = '22023';
  end if;

  select * into c from public.user_credentials where user_id = p_user_id for update;
  if not found then
    raise exception 'E06';
  end if;

  if p_kind = 'pin' then
    v_count := c.failed_pin_count;
    v_until := c.locked_until;
  else
    v_count := c.recovery_failed_count;
    v_until := c.recovery_locked_until;
  end if;

  if v_until > now() then
    allowed := false;
    locked_until := v_until;
    return;
  end if;

  if v_until is not null then
    -- The lock has run out: start counting again.
    v_count := 0;
  end if;

  if v_count >= 3 then
    -- Three attempts already in flight (or left by a crash): this is the 4th.
    allowed := false;
    locked_until := private.apply_lock(p_user_id, p_kind);
    return;
  end if;

  if p_kind = 'pin' then
    update public.user_credentials
    set failed_pin_count = v_count + 1, locked_until = null, updated_at = now()
    where user_id = p_user_id;
  else
    update public.user_credentials
    set recovery_failed_count = v_count + 1, recovery_locked_until = null, updated_at = now()
    where user_id = p_user_id;
  end if;

  allowed := true;
end;
$$;

-- Call AFTER checking the hash. ok: counters reset (a PIN success also resets the
-- lockout count). Failure: the 3rd one locks. attempts_left is for E04 / E16.
create function public.auth_attempt_end(
  p_user_id uuid,
  p_kind    text,
  p_ok      boolean,
  out attempts_left integer,
  out locked_until  timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.user_credentials%rowtype;
  v_count smallint;
begin
  if p_kind not in ('pin', 'recovery') then
    raise exception 'unknown attempt kind %', p_kind using errcode = '22023';
  end if;

  select * into c from public.user_credentials where user_id = p_user_id for update;
  if not found then
    raise exception 'E06';
  end if;

  if p_ok then
    if p_kind = 'pin' then
      update public.user_credentials
      set failed_pin_count = 0, lockout_count = 0, locked_until = null, updated_at = now()
      where user_id = p_user_id;
    else
      update public.user_credentials
      set recovery_failed_count = 0, recovery_locked_until = null, updated_at = now()
      where user_id = p_user_id;
    end if;
    attempts_left := 3;
    return;
  end if;

  insert into public.audit_logs (user_id, action)
  values (p_user_id, p_kind || '_failed');

  if p_kind = 'pin' then
    v_count := c.failed_pin_count;
    locked_until := c.locked_until;
  else
    v_count := c.recovery_failed_count;
    locked_until := c.recovery_locked_until;
  end if;

  if v_count >= 3 and (locked_until is null or locked_until <= now()) then
    locked_until := private.apply_lock(p_user_id, p_kind);
  end if;

  attempts_left := greatest(0, 3 - v_count);
  if locked_until <= now() then
    locked_until := null;
  end if;
end;
$$;

-- ===========================================================================
-- Devices
-- ===========================================================================

-- After a correct PIN (login or reset). Same secret as the active device: nothing
-- changes. A different secret is a new phone: the old device is deactivated (its
-- sessions revoked) and its push token is returned, read BEFORE deactivating, for
-- the "This wasn't me" alert.
create function public.auth_bind_device(
  p_user_id            uuid,
  p_device_secret_hash text,
  p_device_name        text,
  out device_id      uuid,
  out is_new         boolean,
  out old_device_id  uuid,
  out old_push_token text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_active public.devices%rowtype;
begin
  -- One bind at a time per user.
  perform 1 from public.app_users u where u.id = p_user_id for update;

  select * into v_active from public.devices d where d.user_id = p_user_id and d.is_active;

  if found and v_active.device_secret_hash = p_device_secret_hash then
    device_id := v_active.id;
    is_new := false;
    return;
  end if;

  if found then
    old_device_id := v_active.id;
    old_push_token := v_active.push_token;
    update public.devices d set is_active = false, replaced_at = now() where d.id = v_active.id;
    update public.app_sessions s set revoked = true where s.device_id = v_active.id and not s.revoked;
  end if;

  insert into public.devices (user_id, device_secret_hash, name)
  values (p_user_id, p_device_secret_hash, left(p_device_name, 100))
  returning id into device_id;
  is_new := true;

  if old_device_id is not null then
    perform private.notify_security(p_user_id, 'new_device');
  end if;

  insert into public.audit_logs (user_id, device_id, action, details)
  values (p_user_id, device_id, 'device_bound', jsonb_build_object('replaced_device_id', old_device_id));
end;
$$;

-- device-register-push: the push token goes on this device only. The same token is
-- removed from every other device row, so one phone never gets another account's pushes.
create function public.auth_set_push_token(p_device_id uuid, p_push_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.devices d set push_token = null
  where d.push_token = p_push_token and d.id <> p_device_id;

  update public.devices d set push_token = p_push_token
  where d.id = p_device_id and d.is_active;
  if not found then
    raise exception 'E11';
  end if;
end;
$$;

-- auth-enable-biometric (hash) / auth-disable-biometric (NULL), on the active device.
create function public.auth_set_biometric(p_device_id uuid, p_biometric_secret_hash text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  update public.devices d set biometric_secret_hash = p_biometric_secret_hash
  where d.id = p_device_id and d.is_active
  returning d.user_id into v_user;
  if not found then
    raise exception 'E11';
  end if;

  perform private.notify_security(v_user,
    case when p_biometric_secret_hash is null then 'biometric_off' else 'biometric_on' end);
  insert into public.audit_logs (user_id, device_id, action)
  values (v_user, p_device_id,
    case when p_biometric_secret_hash is null then 'biometric_off' else 'biometric_on' end);
end;
$$;

-- ===========================================================================
-- PIN changes, freeze, delete
-- ===========================================================================

-- auth-change-pin, after the current PIN was checked.
create function public.auth_set_pin(p_user_id uuid, p_pin_hash text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.user_credentials c set pin_hash = p_pin_hash, updated_at = now()
  where c.user_id = p_user_id;
  perform private.notify_security(p_user_id, 'pin_changed');
  insert into public.audit_logs (user_id, action) values (p_user_id, 'pin_changed');
end;
$$;

-- auth-reset-pin, after the recovery code was checked: new PIN and recovery code,
-- PIN lock cleared, a frozen account unfrozen, every earlier session revoked.
create function public.auth_reset_pin(p_user_id uuid, p_pin_hash text, p_recovery_hash text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_was_frozen boolean;
begin
  update public.user_credentials c
  set pin_hash = p_pin_hash,
      recovery_hash = p_recovery_hash,
      failed_pin_count = 0,
      lockout_count = 0,
      locked_until = null,
      recovery_failed_count = 0,
      recovery_locked_until = null,
      updated_at = now()
  where c.user_id = p_user_id;

  select u.status = 'frozen' into v_was_frozen from public.app_users u where u.id = p_user_id;
  update public.app_users u set status = 'active' where u.id = p_user_id and u.status = 'frozen';

  update public.app_sessions s set revoked = true where s.user_id = p_user_id and not s.revoked;

  perform private.notify_security(p_user_id, 'pin_reset');
  insert into public.audit_logs (user_id, action, details)
  values (p_user_id, 'pin_reset', jsonb_build_object('unfrozen', v_was_frozen));
end;
$$;

-- account-freeze ("This wasn't me" on the old phone). Accepted only from a device
-- of this account that a new phone replaced in the last 7 days. Returns false
-- (and records it) otherwise. Freezing twice is fine.
create function public.auth_freeze(p_phone text, p_device_secret_hash text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user   uuid;
  v_status text;
  v_device uuid;
begin
  select u.id, u.status into v_user, v_status
  from public.app_users u where u.phone = p_phone
  for update;
  if v_user is null then
    return false;
  end if;

  select d.id into v_device
  from public.devices d
  where d.user_id = v_user
    and d.device_secret_hash = p_device_secret_hash
    and not d.is_active
    and d.replaced_at > now() - interval '7 days'
  order by d.replaced_at desc
  limit 1;

  if v_device is null then
    insert into public.audit_logs (user_id, action) values (v_user, 'freeze_refused');
    return false;
  end if;

  if v_status <> 'frozen' then
    update public.app_users u set status = 'frozen' where u.id = v_user;
    update public.app_sessions s set revoked = true where s.user_id = v_user and not s.revoked;
    perform private.notify_security(v_user, 'frozen');
  end if;

  insert into public.audit_logs (user_id, device_id, action) values (v_user, v_device, 'freeze');
  return true;
end;
$$;

-- account-delete: only at balance 0 (E14). Keeps the row for audit, frees the phone
-- number, deactivates devices, clears push tokens, revokes sessions. Returns the
-- auth user id; the Edge Function then deletes that auth user (which sets
-- auth_user_id to NULL; the database refuses that for an account that isn't deleted).
-- Locks the wallet first, like move_money, so a transfer can't slip in (see
-- *_receiver_recheck.sql).
create function public.auth_delete_account(p_user_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_balance numeric(12, 2);
  v_auth    uuid;
begin
  select w.balance into v_balance from public.wallets w where w.user_id = p_user_id for update;
  if v_balance > 0 then
    raise exception 'E14';
  end if;

  update public.app_users u set status = 'deleted', phone = null
  where u.id = p_user_id and u.status <> 'deleted'
  returning u.auth_user_id into v_auth;
  if not found then
    raise exception 'E11';
  end if;

  update public.devices d set is_active = false, push_token = null, biometric_secret_hash = null
  where d.user_id = p_user_id;
  update public.app_sessions s set revoked = true where s.user_id = p_user_id and not s.revoked;

  insert into public.audit_logs (user_id, action) values (p_user_id, 'account_delete');
  return v_auth;
end;
$$;

-- ===========================================================================
-- Privileges: service_role only (everything is closed by default)
-- ===========================================================================

revoke all on function
  private.security_text(text),
  private.notify_security(uuid, text),
  private.require_session_for(uuid, uuid),
  private.apply_lock(uuid, text)
from public, anon, authenticated;

revoke all on function
  public.auth_phone_registered(text),
  public.auth_lookup(text),
  public.auth_check_session(uuid, uuid),
  public.auth_open_session(uuid, uuid, uuid, text),
  public.auth_logout(uuid),
  public.auth_register_user(uuid, text, text, text, text, text),
  public.auth_orphan_login(text),
  public.auth_attempt_begin(uuid, text),
  public.auth_attempt_end(uuid, text, boolean),
  public.auth_bind_device(uuid, text, text),
  public.auth_set_push_token(uuid, text),
  public.auth_set_biometric(uuid, text),
  public.auth_set_pin(uuid, text),
  public.auth_reset_pin(uuid, text, text),
  public.auth_freeze(text, text),
  public.auth_delete_account(uuid)
from public, anon, authenticated;

grant execute on function
  public.auth_phone_registered(text),
  public.auth_lookup(text),
  public.auth_check_session(uuid, uuid),
  public.auth_open_session(uuid, uuid, uuid, text),
  public.auth_logout(uuid),
  public.auth_register_user(uuid, text, text, text, text, text),
  public.auth_orphan_login(text),
  public.auth_attempt_begin(uuid, text),
  public.auth_attempt_end(uuid, text, boolean),
  public.auth_bind_device(uuid, text, text),
  public.auth_set_push_token(uuid, text),
  public.auth_set_biometric(uuid, text),
  public.auth_set_pin(uuid, text),
  public.auth_reset_pin(uuid, text, text),
  public.auth_freeze(text, text),
  public.auth_delete_account(uuid)
to service_role;
