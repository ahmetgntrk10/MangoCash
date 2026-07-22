-- =====================================================
-- CloudEarn migration — 2026-06-24 (d)
-- FaucetPay payouts, OnClickA removal, task/XOX hardening.
-- Run in Supabase SQL Editor after previous migrations.
-- =====================================================

-- ---------- users: FaucetPay destination ----------
alter table public.users add column if not exists faucetpay_address text;

-- Existing TON address values become FaucetPay destination fallback.
update public.users
   set faucetpay_address = ton_address
 where faucetpay_address is null
   and ton_address is not null;

-- ---------- withdrawals: allow FaucetPay method + payout queue fields ----------
do $$ begin
  alter type public.withdraw_method add value if not exists 'faucetpay';
exception when others then null; end $$;

do $$ begin alter type public.withdraw_status add value if not exists 'queued'; exception when others then null; end $$;
do $$ begin alter type public.withdraw_status add value if not exists 'processing'; exception when others then null; end $$;
do $$ begin alter type public.withdraw_status add value if not exists 'paid'; exception when others then null; end $$;
do $$ begin alter type public.withdraw_status add value if not exists 'failed'; exception when others then null; end $$;

alter table public.withdrawals add column if not exists fee_usdt numeric(18,8) not null default 0;
alter table public.withdrawals add column if not exists amount_net_usdt numeric(18,8);
alter table public.withdrawals add column if not exists batch_id uuid;
alter table public.withdrawals add column if not exists queued_at timestamptz;
alter table public.withdrawals add column if not exists tx_id text;
alter table public.withdrawals add column if not exists processed_at timestamptz;
alter table public.withdrawals add column if not exists processed_by bigint;
create index if not exists idx_wd_batch on public.withdrawals(batch_id);
create index if not exists idx_wd_status_method on public.withdrawals(status, method);

-- FaucetPay payout lock RPC. Uses text comparisons so it stays safe with enum columns.
create or replace function public.faucetpay_lock_next_payout(_batch_id uuid default null)
returns setof public.withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare picked_id uuid;
begin
  select id into picked_id
    from public.withdrawals
   where method::text = 'faucetpay'
     and status::text = 'queued'
     and (_batch_id is null or batch_id = _batch_id)
   order by queued_at asc nulls last, created_at asc
   for update skip locked
   limit 1;

  if picked_id is null then return; end if;

  execute 'update public.withdrawals set status = $1::public.withdraw_status where id = $2'
    using 'processing', picked_id;

  return query select * from public.withdrawals where id = picked_id;
end $$;
grant execute on function public.faucetpay_lock_next_payout(uuid) to service_role;

-- ---------- ad_views: remove OnClickA from allowed task ad networks ----------
do $$ begin
  alter table public.ad_views drop constraint if exists ad_views_network_check;
exception when others then null; end $$;
delete from public.ad_views where network = 'onclicka';
alter table public.ad_views
  add constraint ad_views_network_check
  check (network in ('adsgram','monetag','richads'));

delete from public.app_config where key = 'reward_onclicka';

-- ---------- task_starts / xox_sessions safety, if not already present ----------
create table if not exists public.task_starts (
  user_tg_id bigint not null references public.users(tg_id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  started_at timestamptz not null default now(),
  primary key (user_tg_id, task_id)
);
grant select, insert, update on public.task_starts to authenticated;
grant all on public.task_starts to service_role;
alter table public.task_starts enable row level security;
drop policy if exists "ts self read" on public.task_starts;
drop policy if exists "ts self upsert" on public.task_starts;
drop policy if exists "ts self update" on public.task_starts;
create policy "ts self read" on public.task_starts for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
create policy "ts self upsert" on public.task_starts for insert to authenticated
  with check (user_tg_id = public.current_tg_id());
create policy "ts self update" on public.task_starts for update to authenticated
  using (user_tg_id = public.current_tg_id());

create table if not exists public.xox_sessions (
  user_tg_id bigint primary key references public.users(tg_id) on delete cascade,
  board jsonb not null,
  turn text not null default 'X',
  result text,
  claimed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.xox_sessions to authenticated;
grant all on public.xox_sessions to service_role;
alter table public.xox_sessions enable row level security;
drop policy if exists "xox self read" on public.xox_sessions;
drop policy if exists "xox self upsert" on public.xox_sessions;
drop policy if exists "xox self update" on public.xox_sessions;
create policy "xox self read" on public.xox_sessions for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
create policy "xox self upsert" on public.xox_sessions for insert to authenticated
  with check (user_tg_id = public.current_tg_id());
create policy "xox self update" on public.xox_sessions for update to authenticated
  using (user_tg_id = public.current_tg_id());

-- DONE.