## Overview

Multiple fixes and additions across Cloud Earn Bot, plus a separate roadmap folder inside the repo for a future **referral bonus event** to be applied to a new bot.

---

## 1) Whitelist bypass not working after removal

**Problem:** Removing a `tg_id` from `whitelist` still lets the alt account in.

**Root cause (to verify with a read of `supabase/functions/api/index.ts` during build):** the `init` handler short-circuits duplicate detection when the user row already exists (returning the existing user without re-running the score check), so once an account was created while whitelisted, later removals don't re-check.

**Fix:**

- In `init`, always run the duplicate scorer regardless of whether the user row is new or existing.
- Whitelist check is queried live from `whitelist` table on every `init` call — no caching.
- If the user is not whitelisted AND score ≥ 60 AND an older matched account exists → block. This blocks the alt even if it was created earlier while whitelisted.
- Keep the "oldest account never blocked" rule so the original account still works after its alt gets whitelisted+removed.

## 2) `user_devices` table stays empty

**Root cause (to verify):** the insert into `user_devices` is likely gated behind a condition (e.g. only on new-user creation, or missing `service_role` client, or unique-index conflict silently dropping rows). Also `x-forwarded-for` may be missing in local calls.

**Fix:**

- Insert/upsert into `user_devices` on **every** `init` call for **every** user (whitelisted or not — we still want the history for admin inspection).
- Use `on conflict (tg_id, coalesce(fp_hash,''), coalesce(host(ip),''))` → update `last_seen`, refresh other columns.
- Handle IPv6 and missing IP cleanly (store null when absent, don't crash).
- Wrap in try/catch so an insert failure never blocks login.

Answer to user's question: **every** user's device data will appear in `user_devices` (not only suspects). `duplicate_suspects` stays limited to 40–59 score matches for admin review.

## 3) Profile → Cloud Market Claim Alerts toggle rendering

**Problem:** The switch "pops out" of its row on some devices.

**Fix:** Rework `NotifyMarketRow` in `src/pages/Profile.tsx` to use the same `flex items-center justify-between` + `shrink-0` pattern as the other Profile rows (language row), remove any fixed widths that overflow on narrow viewports. Rename label to **"Cloud Market Claim Alerts"** in all 17 i18n locales (default English fallback).

## 4) Exclusive Task pricing + admin form

- `src/pages/Task.tsx` (or wherever user-created Exclusive form lives): change per-person price `0.01 → 0.005 USDT`; commission `55% → 80%` (payout to task-poster's audience becomes 20%).
- Under the form add helper text (translated): *"If your balance isn't enough, DM @ahmetgntrk for a special promo code."*
- `src/pages/Admin/Tasks.tsx`: when Category = Exclusive, switch the reward-type field from Cloud to USDT (label + unit + validation), and in the backend `admin_create_task` store `reward_usdt` instead of `reward_cloud` for Exclusive. Fix payout on completion so Exclusive tasks credit `usdt_balance`, not cloud.

## 5) Referral — remove "1 mining required" gate

- Backend: count referrals as soon as invitee is created (not on first `mining_claim`). Keep the anti-fake protection via existing duplicate-detection (fp/ip score). A blocked alt never becomes a user row, so bots/alts naturally don't count.
- Remove the `referral_count` bump from `mining_claim`; add it back to `init` on new-user creation with a `referred_by`.
- Frontend `Referral.tsx`: delete the sentence *"Invites count only after your friend claims their first mining reward. Fake accounts are ignored."* Keep only *"Lifetime 15% commission on everything they earn."* Update all i18n keys.

## 6) Admin Payments — show user balance on pending withdrawal card

- `src/pages/Admin/Payments.tsx`: extend the FaucetPay / Binance Pay / Toncoin pending cards to show `Cloud: X · USDT: Y` for the requesting user.
- Backend `admin_list_withdrawals` (or equivalent): join `users` to include `cloud_balance` and `usdt_balance` in the response. No new tables.

## 7) Roadmap folder for the future bot's referral-bonus event

Create in the repo:

```
ref-bonus/
  ROADMAP.md
```

`ROADMAP.md` contains, for the **new bot only** (not applied to Cloud Earn now):

- Feature spec: +1800 Cloud per invited user, split as
  - +300 on invitee's first mining claim
  - +500 on Day 1 if invitee watches 10 Adsgram click-verified ads that day (all-or-nothing, resets at 00:00 UTC)
  - +500 on Day 2 (same rule)
  - +500 on Day 3 (same rule)
- Exact file paths + line ranges to replace, with the current snippet and the replacement snippet, for:
  - `supabase/functions/api/index.ts` — `mining_claim`, ad-reward handler, new `ref_bonus_progress` action
  - `src/pages/Referral.tsx` — progress UI per invitee (mining ✓, Day 1 x/10, Day 2 x/10, Day 3 x/10, totals credited)
  - `src/lib/i18n.translations.ts` — new strings
- SQL block (idempotent, `create ... if not exists`, `add column if not exists`) for a new `referral_bonus_progress` table tracking per-invitee daily ad counts, day index, credited flags, and reset timestamps. No re-creation of existing tables/columns.

The roadmap explicitly notes: **do not apply any of this to the current Cloud Earn codebase.**

&nbsp;

Please review the current files in the "supabase/migrations" directory on GitHub.

If there is anything else that needs to be configured for the new bot—such as webhooks or any other required setup that was necessary for the CloudEarn bot—please add it there.

I will use the migration files in that directory to set up the Supabase backend for the new bot, so I want to make sure everything required is included and nothing is missing.

---

## Files to touch (Cloud Earn, this turn)

- `supabase/functions/api/index.ts` — whitelist re-check, always-log devices, ref count on init, Exclusive USDT reward, admin balances in withdrawal list
- `src/pages/Profile.tsx` — row layout fix, renamed label
- `src/lib/i18n.translations.ts` — renamed alert label, removed referral gate copy, promo-code helper text (17 langs)
- `src/pages/Referral.tsx` — remove gate sentence
- `src/pages/Task.tsx` — 0.005 price, 80% commission, promo helper text
- `src/pages/Admin/Tasks.tsx` — Exclusive → USDT reward type
- `src/pages/Admin/Payments.tsx` — show user balances on pending cards
- `ref-bonus/ROADMAP.md` — new, roadmap only (not wired)

## SQL (delivered at end for user to run)

Idempotent migration `db/migration_2026_07_22.sql`:

- No new tables required for items 1–6 (existing tables already cover it).
- Backfill: recompute `referral_count` from `users.referred_by` (drop old mining-gated logic).
- Any missing `GRANT` on `user_devices` / `duplicate_suspects` re-asserted.

Separate SQL block inside `ref-bonus/ROADMAP.md` for the future bot's `referral_bonus_progress` table (guarded with `if not exists`).