# Cloud Earn — Telegram Mini App

A Telegram Mini App on React 18 + Vite + Tailwind v4 + Supabase.

## Architecture
- **Frontend** (Vercel): React app, calls a single Supabase Edge Function (`api`) with `x-telegram-init-data`. No client-side Supabase Auth.
- **Backend** (Supabase Edge Functions):
  - `api` — all CRUD/business logic (auth, tasks, ads, XOX, withdrawals, admin).
  - `ton-payouts` — TonConsole worker; sends 1 queued payout per invocation.
  - `announce-worker` — sends batched broadcasts (custom or silent-copy).

## Environment variables

### Vercel (frontend)
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_TG_BOT_USERNAME=CloudEarnBot
VITE_PAYMENT_CHANNEL_ID=-1003849033551
VITE_ADSGRM_REWARD_BLOCK=35930
VITE_ADSGRM_INT_FORCE=int-35932
VITE_ADSGRM_INT_AUTO=int-35931
```

### Supabase → Project Settings → Edge Function Secrets
```
TELEGRAM_BOT_TOKEN=<from BotFather>
PAYMENT_CHANNEL_ID=-1003849033551
TONCONSOLE_API_KEY=<TonConsole API key>
TONCONSOLE_WALLET_ID=<your TonKeeper wallet id>
```

> `SUPABASE_JWT_SECRET` is **not** required — the api function validates Telegram initData directly.

## Database

Run **`db/migration_2026_06_23.sql`** in the Supabase SQL editor once. It is fully idempotent and safe to re-run. The base schema in `db/schema.sql` must already be applied.

## GitHub Actions

Every push to `main` triggers `.github/workflows/deploy.yml` which:
1. Runs `supabase db push` (migrations).
2. Deploys every folder under `supabase/functions/` with `--no-verify-jwt`.

Required GitHub Actions repository secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`.

> If a function is deleted from the repo you must remove it manually with `supabase functions delete <name>` — the workflow only deploys.

## TonConsole payouts (cron)

Schedule the `ton-payouts` function to run every 5 seconds so the bulk-pay queue drains:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'cloudearn_ton_worker', '*/5 * * * * *',
  $$ select net.http_post(
       url:='https://<PROJECT-REF>.functions.supabase.co/ton-payouts',
       headers:='{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
     ); $$);
```

Replace `<PROJECT-REF>` and `<SERVICE_ROLE_KEY>`.

## Tunables (where to edit)

| What | File / Place |
|---|---|
| Daily reward (Bulut) | `src/lib/config.ts` → `DAILY_REWARD_CLOUD` + `db migration` `app_config.daily_reward_cloud` (server) |
| Ad network rewards / cooldown / daily limit | `src/lib/config.ts` → `AD_NETWORKS` (UI) and the `record_ad_view` switch in `supabase/functions/api/index.ts` (server cap) |
| Withdrawal fees & minimums | `src/lib/config.ts` → `WITHDRAW` (UI) and the `request_withdrawal` action in `supabase/functions/api/index.ts` (server) |
| Referral amounts (300 / 700 / 10%) | `supabase/functions/api/index.ts` top constants `REF_BASE_CLOUD`, `REF_BONUS_CLOUD`, `REF_COMMISSION_PCT` |
| Min referrals for withdraw | `src/lib/config.ts` → `REF_MIN_FOR_WITHDRAW` and the `request_withdrawal` action (server: `< 2`) |
| XOX cost / reward / daily limit | `src/lib/config.ts` → `GAME_XOX` and `xox_*` actions in `supabase/functions/api/index.ts` |
| Adsgram block ids | Vercel env (`VITE_ADSGRM_*`) |
| Payments channel | `src/lib/config.ts` → `CHANNELS.payments` and `PAYMENT_CHANNEL_ID` secret |
| Official channel | `src/lib/config.ts` → `CHANNELS.official` |

To lower the minimum withdrawal yourself, edit `WITHDRAW.ton.min` / `WITHDRAW.binance.min` in `src/lib/config.ts` and bump the same row in `app_config` (server). Then push.
