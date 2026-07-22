-- =====================================================
-- CloudEarn — 2026-07-14
-- Multi-signal duplicate detection, market daily cap,
-- notify_market opt-in, ad-notify tracking.
-- =====================================================

-- 1. user_devices — full signal history per user
create table if not exists public.user_devices (
  id           uuid primary key default gen_random_uuid(),
  tg_id        bigint not null references public.users(tg_id) on delete cascade,
  fp_hash      text,
  webgl_hash   text,
  audio_hash   text,
  tz           text,
  lang         text,
  platform     text,
  ip           inet,
  ip_subnet24  inet,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);

create unique index if not exists user_devices_uq
  on public.user_devices(tg_id, coalesce(fp_hash,''), coalesce(host(ip),''));
create index if not exists user_devices_fp_idx      on public.user_devices(fp_hash);
create index if not exists user_devices_webgl_idx   on public.user_devices(webgl_hash);
create index if not exists user_devices_audio_idx   on public.user_devices(audio_hash);
create index if not exists user_devices_ip_idx      on public.user_devices(ip);
create index if not exists user_devices_ip24_idx    on public.user_devices(ip_subnet24);

alter table public.user_devices enable row level security;
grant select, insert, update, delete on public.user_devices to service_role;

-- 2. duplicate_suspects — scores 40..59 logged for admin inspection
create table if not exists public.duplicate_suspects (
  id            uuid primary key default gen_random_uuid(),
  tg_id         bigint not null,
  matched_tg_id bigint not null,
  score         int not null,
  created_at    timestamptz not null default now()
);
create index if not exists duplicate_suspects_tg_idx on public.duplicate_suspects(tg_id);
alter table public.duplicate_suspects enable row level security;
grant all on public.duplicate_suspects to service_role;

-- 3. users.notify_market opt-in for claim-ready DMs
alter table public.users
  add column if not exists notify_market boolean not null default false;

-- 4. user_clouds: daily claim counter + notify-stamp
alter table public.user_clouds
  add column if not exists daily_claims jsonb not null default '{}'::jsonb;
alter table public.user_clouds
  add column if not exists last_notified_at timestamptz;

-- 5. Cron: run market notifier every 5 minutes (pg_cron + pg_net).
-- Safe to re-run; drops the old job first.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid)
      from cron.job where jobname = 'cloudearn_market_notify';
    perform cron.schedule(
      'cloudearn_market_notify', '*/5 * * * *', $cron$
        select net.http_post(
          url := current_setting('app.settings.functions_url', true) || '/market-notify-worker',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
  end if;
end $$;