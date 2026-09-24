-- ledger_entries and audit_logs are insert-only (CLAUDE.md §7.1).
-- Triggers apply to every role, including service_role and postgres,
-- so not even an Edge Function or the dashboard can rewrite history.

create function private.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is insert-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger ledger_entries_no_update_delete
  before update or delete on public.ledger_entries
  for each row execute function private.reject_change();

create trigger ledger_entries_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function private.reject_change();

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function private.reject_change();

create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function private.reject_change();
