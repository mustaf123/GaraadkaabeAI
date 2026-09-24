-- Security alerts exist only for: new phone, freeze, PIN reset, PIN change and
-- fingerprint on/off. A normal login creates none (CLAUDE.md §7.5). The
-- Notifications mockup's "New login" sample stands for the new-phone alert, so
-- that alert is now titled "New phone logged in to your wallet".
-- Only the new_device text changes; rows already stored keep their text.

create or replace function private.security_text(p_event text, out title text, out body text)
language plpgsql
immutable
set search_path = ''
as $$
begin
  case p_event
    when 'new_device' then
      title := 'New phone logged in to your wallet';
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

-- create or replace keeps the privileges; stated again so this file is complete.
revoke all on function private.security_text(text) from public, anon, authenticated;
