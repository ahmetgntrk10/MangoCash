-- ============================================================
-- CloudEarn — 2026-06-26 migration
-- Idempotent: safe to re-run.
-- ============================================================

-- 1) Ad tickets — single-use, short-lived proof that the user actually
--    watched (and click-verified) an ad for a specific purpose.
create table if not exists public.ad_tickets (
  id uuid primary key default gen_random_uuid(),
  user_tg_id bigint not null,
  purpose text not null check (purpose in ('daily','withdraw','promo','xox','task_ads')),
  network text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '120 seconds'),
  consumed_at timestamptz,
  consumed_ok boolean
);
create index if not exists idx_ad_tickets_user on public.ad_tickets(user_tg_id, purpose, created_at desc);

grant select, insert, update on public.ad_tickets to authenticated;
grant all on public.ad_tickets to service_role;
alter table public.ad_tickets enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'ad_tickets_service_all' and tablename = 'ad_tickets') then
    create policy ad_tickets_service_all on public.ad_tickets for all to service_role using (true) with check (true);
  end if;
end $$;

-- 2) Partner links
create table if not exists public.partner_links (
  code text primary key,
  label text not null,
  created_by bigint,
  created_at timestamptz not null default now(),
  is_active boolean not null default true,
  click_count integer not null default 0,
  signup_count integer not null default 0
);
grant select on public.partner_links to authenticated;
grant all on public.partner_links to service_role;
alter table public.partner_links enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'partner_links_service_all' and tablename = 'partner_links') then
    create policy partner_links_service_all on public.partner_links for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'partner_links_read_auth' and tablename = 'partner_links') then
    create policy partner_links_read_auth on public.partner_links for select to authenticated using (true);
  end if;
end $$;

-- 3) Users new columns
alter table public.users
  add column if not exists partner_code text,
  add column if not exists last_active_at timestamptz default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_partner_code_fk') then
    alter table public.users
      add constraint users_partner_code_fk
      foreign key (partner_code) references public.partner_links(code) on delete set null;
  end if;
end $$;
create index if not exists idx_users_partner on public.users(partner_code);
create index if not exists idx_users_last_active on public.users(last_active_at desc);

-- 4) Tasks new columns
alter table public.tasks
  add column if not exists task_type text default 'link',
  add column if not exists bot_check_status text default 'unknown',
  add column if not exists bot_check_deadline timestamptz,
  add column if not exists channel_username text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_task_type_check') then
    alter table public.tasks
      add constraint tasks_task_type_check check (task_type in ('link','channel'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_bot_check_status_check') then
    alter table public.tasks
      add constraint tasks_bot_check_status_check check (bot_check_status in ('unknown','ok','pending_bot','failed'));
  end if;
end $$;

-- 5) Withdrawals new columns & relaxed status set
alter table public.withdrawals
  add column if not exists batch_id uuid,
  add column if not exists last_error text,
  add column if not exists queued_at timestamptz;
create index if not exists idx_withdrawals_batch on public.withdrawals(batch_id);

do $$ begin
  alter table public.withdrawals drop constraint if exists withdrawals_status_check;
  alter table public.withdrawals
    add constraint withdrawals_status_check
    check (status in ('pending','queued','processing','approved','paid','rejected','rejected_invalid_address','failed'));
exception when others then null;
end $$;

-- 6) Atomic FaucetPay lock function (returns next available row & flips to processing)
create or replace function public.faucetpay_lock_next_payout(_batch_id uuid)
returns setof public.withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.withdrawals%rowtype;
begin
  select * into v_row
  from public.withdrawals
  where method = 'faucetpay'
    and status in ('queued','approved')
    and (_batch_id is null or batch_id = _batch_id)
  order by queued_at nulls last, created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.withdrawals
    set status = 'processing'
    where id = v_row.id;
  v_row.status := 'processing';
  return next v_row;
end;
$$;
grant execute on function public.faucetpay_lock_next_payout(uuid) to service_role;

-- 7) ad_view_attempts (cooldown ledger) — for backend cooldown enforcement
create table if not exists public.ad_view_attempts (
  id bigserial primary key,
  user_tg_id bigint not null,
  network text not null,
  status text not null check (status in ('ok','failed','no-fill')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_avat_user_net_time
  on public.ad_view_attempts(user_tg_id, network, created_at desc);
grant select, insert on public.ad_view_attempts to authenticated;
grant all on public.ad_view_attempts to service_role;
alter table public.ad_view_attempts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'ad_view_attempts_service_all' and tablename = 'ad_view_attempts') then
    create policy ad_view_attempts_service_all on public.ad_view_attempts for all to service_role using (true) with check (true);
  end if;
end $$;
