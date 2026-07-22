-- =====================================================
-- CloudEarn migration — 2026-06-24
-- Idempotent; safe to re-run.
-- =====================================================

-- ----- app_config tunables -----
insert into public.app_config(key, value) values
  ('min_withdraw_ton',     '0.1'::jsonb),
  ('min_withdraw_binance', '0.2'::jsonb),
  ('reward_adsgram',       '75'::jsonb),
  ('reward_monetag',       '25'::jsonb),
  ('reward_richads',       '40'::jsonb)
on conflict (key) do update set value = excluded.value;

-- ----- referral binding columns -----
alter table public.referrals add column if not exists bound_via text;     -- 'bot_start' | 'miniapp'
alter table public.referrals add column if not exists bound_at timestamptz default now();

-- ----- total_earned_cloud trigger (bump on every balance_cloud increment) -----
create or replace function public.bump_total_earned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.balance_cloud, 0) > coalesce(old.balance_cloud, 0) then
    update public.users
       set total_earned_cloud = coalesce(total_earned_cloud, 0)
                              + (coalesce(new.balance_cloud, 0) - coalesce(old.balance_cloud, 0))
     where tg_id = new.tg_id
       -- avoid recursive trigger loops
       and pg_trigger_depth() < 2;
  end if;
  return new;
end $$;

drop trigger if exists trg_bump_total_earned on public.users;
create trigger trg_bump_total_earned
  after update of balance_cloud on public.users
  for each row execute function public.bump_total_earned();

-- ----- per-user paged user list for admin -----
create or replace function public.admin_list_users_paged(_q text, _page int, _page_size int default 200)
returns table(rows jsonb, total bigint)
language plpgsql security definer set search_path = public as $$
declare
  _off int := greatest(_page, 1) - 1;
  _total bigint;
begin
  select count(*) into _total from public.users
   where _q is null
      or username ilike '%' || _q || '%'
      or tg_id::text = _q;
  return query
  select coalesce(jsonb_agg(t.*), '[]'::jsonb), _total
  from (
    select *
      from public.users
     where _q is null
        or username ilike '%' || _q || '%'
        or tg_id::text = _q
     order by created_at desc
     limit _page_size offset _off * _page_size
  ) t;
end $$;
grant execute on function public.admin_list_users_paged(text, int, int) to authenticated, service_role;

-- ----- paged withdrawal history -----
create or replace function public.admin_wd_history_paged(_page int, _page_size int default 200)
returns table(rows jsonb, total bigint)
language plpgsql security definer set search_path = public as $$
declare
  _off int := greatest(_page, 1) - 1;
  _total bigint;
begin
  select count(*) into _total
    from public.withdrawals
   where status <> 'pending';
  return query
  select coalesce(jsonb_agg(t.*), '[]'::jsonb), _total
  from (
    select w.*, row_to_json(u.*) as users
      from public.withdrawals w
      left join public.users u on u.tg_id = w.user_tg_id
     where w.status <> 'pending'
     order by w.created_at desc
     limit _page_size offset _off * _page_size
  ) t;
end $$;
grant execute on function public.admin_wd_history_paged(int, int) to authenticated, service_role;

-- DONE