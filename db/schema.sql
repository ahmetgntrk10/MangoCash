-- =====================================================
-- CloudEarn Schema — Phase 1
-- Paste this into Supabase Dashboard → SQL Editor → Run.
-- =====================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  tg_id bigint unique not null,
  username text,
  first_name text,
  last_name text,
  language_code text default 'en',
  photo_url text,
  balance_cloud bigint not null default 0,
  balance_usdt numeric(18,8) not null default 0,
  total_earned_cloud bigint not null default 0,
  ref_earnings_cloud bigint not null default 0,
  referral_count integer not null default 0,
  referred_by bigint references public.users(tg_id) on delete set null,
  ip_address text,
  country text,
  status text not null default 'active' check (status in ('active','banned','warned')),
  warnings_count integer not null default 0,
  binance_uid text,
  ton_address text,
  last_daily_reward_at timestamptz,
  ads_watched_for_ref integer not null default 0,
  ref_bonus_unlocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_users_tg_id on public.users(tg_id);
create index if not exists idx_users_referred_by on public.users(referred_by);
drop trigger if exists trg_users_updated on public.users;
create trigger trg_users_updated before update on public.users
  for each row execute function public.set_updated_at();

create table if not exists public.admins (
  tg_id bigint primary key,
  username text,
  added_by bigint,
  created_at timestamptz not null default now()
);
insert into public.admins (tg_id, username) values (5640381390, 'ahmetgntrk')
  on conflict (tg_id) do nothing;

create or replace function public.is_admin(_tg_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.admins where tg_id = _tg_id);
$$;

create or replace function public.current_tg_id()
returns bigint language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'tg_id','')::bigint,
    (select u.tg_id from public.users u where u.auth_user_id = auth.uid())
  );
$$;

create or replace function public.link_auth_user_to_tg_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.raw_user_meta_data ? 'tg_id' then
    update public.users
      set auth_user_id = new.id
      where tg_id = (new.raw_user_meta_data->>'tg_id')::bigint;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_link_auth_user_to_tg_id on auth.users;
create trigger trg_link_auth_user_to_tg_id
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.link_auth_user_to_tg_id();

do $$ begin create type public.task_category as enum ('social','exclusive','ads','partners'); exception when duplicate_object then null; end $$;
do $$ begin create type public.task_verification as enum ('timer','channel','manual'); exception when duplicate_object then null; end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  category public.task_category not null,
  title text not null,
  description text,
  link text,
  reward_cloud bigint not null default 0,
  reward_usdt numeric(18,8) not null default 0,
  verification public.task_verification not null default 'timer',
  timer_seconds integer,
  channel_username text,
  max_completions integer,
  completions_count integer not null default 0,
  is_active boolean not null default true,
  created_by_tg_id bigint,
  is_exclusive boolean not null default false,
  paid_usdt numeric(18,8) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tasks_category on public.tasks(category) where is_active;
create index if not exists idx_tasks_creator on public.tasks(created_by_tg_id);
drop trigger if exists trg_tasks_updated on public.tasks;
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function public.set_updated_at();

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_tg_id bigint not null references public.users(tg_id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique(task_id, user_tg_id)
);
create index if not exists idx_tc_user on public.task_completions(user_tg_id);

do $$ begin create type public.withdraw_method as enum ('ton','binance'); exception when duplicate_object then null; end $$;
do $$ begin create type public.withdraw_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_tg_id bigint not null references public.users(tg_id) on delete cascade,
  method public.withdraw_method not null,
  amount_usdt numeric(18,8) not null check (amount_usdt > 0),
  destination text not null,
  status public.withdraw_status not null default 'pending',
  tx_id text,
  processed_by bigint,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_wd_status on public.withdrawals(status, method);
create index if not exists idx_wd_user on public.withdrawals(user_tg_id);

create table if not exists public.conversions (
  id uuid primary key default gen_random_uuid(),
  user_tg_id bigint not null references public.users(tg_id) on delete cascade,
  cloud_amount bigint not null,
  usdt_amount numeric(18,8) not null,
  rate numeric(18,10) not null default 0.00001,
  created_at timestamptz not null default now()
);
create index if not exists idx_conv_user on public.conversions(user_tg_id);

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  reward_type text not null default 'usdt' check (reward_type in ('usdt','cloud')),
  reward_amount numeric(18,8) not null,
  max_completions integer,
  completions_count integer not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_promo_updated on public.promo_codes;
create trigger trg_promo_updated before update on public.promo_codes
  for each row execute function public.set_updated_at();

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.promo_codes(id) on delete cascade,
  user_tg_id bigint not null references public.users(tg_id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique(promo_id, user_tg_id)
);

do $$ begin create type public.announce_status as enum ('draft','sending','sent','failed'); exception when duplicate_object then null; end $$;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  source_chat_id bigint not null,
  source_message_id bigint not null,
  batch_size integer not null default 25,
  delay_seconds integer not null default 1,
  status public.announce_status not null default 'draft',
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by bigint,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  user_tg_id bigint not null references public.users(tg_id) on delete cascade,
  game text not null default 'xox',
  result text not null check (result in ('win','lose','draw')),
  reward_cloud bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_game_user on public.game_results(user_tg_id, created_at desc);

create table if not exists public.referral_earnings (
  id uuid primary key default gen_random_uuid(),
  referrer_tg_id bigint not null references public.users(tg_id) on delete cascade,
  referee_tg_id bigint not null references public.users(tg_id) on delete cascade,
  amount_cloud bigint not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_re_referrer on public.referral_earnings(referrer_tg_id);

-- GRANTS
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.users to authenticated;
grant select on public.admins to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert on public.task_completions to authenticated;
grant select, insert, update on public.withdrawals to authenticated;
grant select, insert on public.conversions to authenticated;
grant select, insert, update, delete on public.promo_codes to authenticated;
grant select, insert on public.promo_redemptions to authenticated;
grant select, insert on public.game_results to authenticated;
grant select on public.referral_earnings to authenticated;
grant select, insert, update on public.announcements to authenticated;
grant insert, delete on public.admins to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role, authenticated;

-- RLS
alter table public.users enable row level security;
alter table public.admins enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.withdrawals enable row level security;
alter table public.conversions enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.announcements enable row level security;
alter table public.game_results enable row level security;
alter table public.referral_earnings enable row level security;

drop policy if exists "users self read" on public.users;
create policy "users self read" on public.users for select to authenticated
  using (tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "users self update" on public.users;
create policy "users self update" on public.users for update to authenticated
  using (tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()))
  with check (tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));

drop policy if exists "admins read" on public.admins;
create policy "admins read" on public.admins for select to authenticated using (true);
drop policy if exists "admins write" on public.admins;
create policy "admins write" on public.admins for all to authenticated
  using (public.is_admin(public.current_tg_id()))
  with check (public.is_admin(public.current_tg_id()));

drop policy if exists "tasks read" on public.tasks;
create policy "tasks read" on public.tasks for select to authenticated
  using (is_active or created_by_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "tasks user insert" on public.tasks;
create policy "tasks user insert" on public.tasks for insert to authenticated
  with check (
    public.is_admin(public.current_tg_id())
    or (created_by_tg_id = public.current_tg_id() and is_exclusive = true and category = 'exclusive')
  );
drop policy if exists "tasks admin update" on public.tasks;
create policy "tasks admin update" on public.tasks for update to authenticated
  using (public.is_admin(public.current_tg_id())) with check (public.is_admin(public.current_tg_id()));
drop policy if exists "tasks admin delete" on public.tasks;
create policy "tasks admin delete" on public.tasks for delete to authenticated
  using (public.is_admin(public.current_tg_id()));

drop policy if exists "tc self" on public.task_completions;
create policy "tc self" on public.task_completions for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "tc self insert" on public.task_completions;
create policy "tc self insert" on public.task_completions for insert to authenticated
  with check (user_tg_id = public.current_tg_id());

drop policy if exists "wd self read" on public.withdrawals;
create policy "wd self read" on public.withdrawals for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "wd self insert" on public.withdrawals;
create policy "wd self insert" on public.withdrawals for insert to authenticated
  with check (user_tg_id = public.current_tg_id());
drop policy if exists "wd admin update" on public.withdrawals;
create policy "wd admin update" on public.withdrawals for update to authenticated
  using (public.is_admin(public.current_tg_id())) with check (public.is_admin(public.current_tg_id()));

drop policy if exists "conv self read" on public.conversions;
create policy "conv self read" on public.conversions for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "conv self insert" on public.conversions;
create policy "conv self insert" on public.conversions for insert to authenticated
  with check (user_tg_id = public.current_tg_id());

drop policy if exists "promo admin all" on public.promo_codes;
create policy "promo admin all" on public.promo_codes for all to authenticated
  using (public.is_admin(public.current_tg_id()))
  with check (public.is_admin(public.current_tg_id()));
drop policy if exists "promo redeem self" on public.promo_redemptions;
create policy "promo redeem self" on public.promo_redemptions for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "promo redeem self insert" on public.promo_redemptions;
create policy "promo redeem self insert" on public.promo_redemptions for insert to authenticated
  with check (user_tg_id = public.current_tg_id());

drop policy if exists "ann admin" on public.announcements;
create policy "ann admin" on public.announcements for all to authenticated
  using (public.is_admin(public.current_tg_id()))
  with check (public.is_admin(public.current_tg_id()));

drop policy if exists "game self" on public.game_results;
create policy "game self" on public.game_results for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "game self insert" on public.game_results;
create policy "game self insert" on public.game_results for insert to authenticated
  with check (user_tg_id = public.current_tg_id());

drop policy if exists "re self read" on public.referral_earnings;
create policy "re self read" on public.referral_earnings for select to authenticated
  using (referrer_tg_id = public.current_tg_id() or referee_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));

-- RPCs
create or replace function public.award_task_reward(_task_id uuid, _user_tg_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare _reward bigint;
begin
  select reward_cloud into _reward from public.tasks where id = _task_id and is_active = true;
  if _reward is null then raise exception 'Task not found or inactive'; end if;
  update public.users
    set balance_cloud = balance_cloud + _reward,
        total_earned_cloud = total_earned_cloud + _reward
    where tg_id = _user_tg_id;
  update public.tasks set completions_count = completions_count + 1 where id = _task_id;
end $$;
grant execute on function public.award_task_reward(uuid, bigint) to authenticated;

create or replace function public.redeem_promo_code(_code text, _user_tg_id bigint)
returns numeric language plpgsql security definer set search_path = public as $$
declare p public.promo_codes%rowtype;
begin
  select * into p from public.promo_codes where code = _code and is_active = true for update;
  if not found then raise exception 'Invalid code'; end if;
  if p.expires_at is not null and p.expires_at < now() then raise exception 'Expired'; end if;
  if p.max_completions is not null and p.completions_count >= p.max_completions then raise exception 'Limit reached'; end if;
  if exists (select 1 from public.promo_redemptions where promo_id = p.id and user_tg_id = _user_tg_id) then
    raise exception 'Already redeemed'; end if;
  insert into public.promo_redemptions(promo_id, user_tg_id) values (p.id, _user_tg_id);
  update public.promo_codes set completions_count = completions_count + 1 where id = p.id;
  if p.reward_type = 'usdt' then
    update public.users set balance_usdt = balance_usdt + p.reward_amount where tg_id = _user_tg_id;
  else
    update public.users set balance_cloud = balance_cloud + p.reward_amount::bigint,
      total_earned_cloud = total_earned_cloud + p.reward_amount::bigint where tg_id = _user_tg_id;
  end if;
  return p.reward_amount;
end $$;
grant execute on function public.redeem_promo_code(text, bigint) to authenticated;