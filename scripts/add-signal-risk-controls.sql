-- Per-signal TP/SL controls for auto_signal_rules.
-- Run this against the connected Supabase database before enabling the UI.
alter table public.auto_signal_rules
  add column if not exists stop_loss_enabled boolean not null default false,
  add column if not exists stop_loss_percent numeric,
  add column if not exists take_profit_enabled boolean not null default false,
  add column if not exists take_profit_percent numeric;

alter table public.auto_signal_rules
  add constraint auto_signal_rules_stop_loss_percent_valid
    check (stop_loss_percent is null or (stop_loss_percent > 0 and stop_loss_percent <= 100)),
  add constraint auto_signal_rules_take_profit_percent_valid
    check (take_profit_percent is null or (take_profit_percent > 0 and take_profit_percent <= 100));

-- Preserve the old global stop-loss behavior for existing rules only when it was enabled.
update public.auto_signal_rules r
set stop_loss_enabled = coalesce(r.stop_loss_enabled, false)
where r.stop_loss_enabled is null;

revoke all on public.auto_signal_rules from anon, authenticated;
