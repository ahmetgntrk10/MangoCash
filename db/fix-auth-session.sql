-- CloudEarn auth fix for existing Supabase projects.
-- Run this once in Supabase SQL Editor if you already ran db/schema.sql before this fix.

alter table public.users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

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