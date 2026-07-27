# Referral Bonus Event — Roadmap (NEW BOT ONLY)

> ⚠️ Do NOT apply this to the current Cloud Earn codebase. This spec is for a
> future forked bot with its own token/DB. Apply only after cloning the repo
> into the new bot.

## Feature spec

Each successful invitee earns the referrer **+1800 Cloud** total, unlocked in stages:

| Stage        | Reward     | Condition                                                                     |
| ------------ | ---------- | ----------------------------------------------------------------------------- |
| Mining boot  | +300 Cloud | Invitee completes their **first mining claim** (Earn page top card).          |
| Day 1 bundle | +500 Cloud | Invitee watches **10 Adsgram click-verified ads** in a single UTC day.        |
| Day 2 bundle | +500 Cloud | Same rule, different UTC day.                                                 |
| Day 3 bundle | +500 Cloud | Same rule, different UTC day.                                                 |

Rules:

- Ad counter resets at **00:00 UTC** every day. 9/10 does not carry over.
- Only Adsgram click-verified ads (uses existing `ad_ticket` + `ad_view_attempts` pipeline) count toward the daily 10.
- Stages are sequential: Day 2 only starts counting the day AFTER Day 1 was cleared. If Day 1 is not cleared for weeks, Day 2/3 wait.
- Once all 4 stages are cleared for an invitee, no further bonus.
- Referral must be `is_eligible = true` (non-duplicate device) to earn any stage.

---

## Files to edit in the NEW BOT

### 1. `supabase/functions/api/index.ts`

#### 1a. Add helper near top (below other consts, ~line 70):

```ts
const REF_BONUS_MINING = 300;
const REF_BONUS_DAY = 500;
const REF_BONUS_DAILY_ADS_REQUIRED = 10;
```

#### 1b. In `mining_claim` handler — REPLACE the referral block

Find the `case "mining_claim":` block. After the `commissionToReferrer(...)`
call for `"mining"`, insert:

```ts
// Ref-bonus: +300 Cloud to referrer on invitee's FIRST mining claim.
if (u.referred_by) {
  try {
    const { data: rp } = await supabase.from("referral_bonus_progress")
      .select("mining_credited").eq("referee_tg_id", tgId).maybeSingle();
    if (!rp?.mining_credited) {
      await supabase.from("referral_bonus_progress").upsert({
        referee_tg_id: tgId, referrer_tg_id: u.referred_by,
        mining_credited: true, mining_credited_at: new Date().toISOString(),
      }, { onConflict: "referee_tg_id" });
      const { data: refU } = await supabase.from("users")
        .select("balance_cloud,total_earned_cloud")
        .eq("tg_id", u.referred_by).maybeSingle();
      if (refU) {
        await supabase.from("users").update({
          balance_cloud: Number(refU.balance_cloud) + REF_BONUS_MINING,
          total_earned_cloud: Number(refU.total_earned_cloud) + REF_BONUS_MINING,
        }).eq("tg_id", u.referred_by);
      }
    }
  } catch (e) { console.error("ref-bonus mining", e); }
}
```

#### 1c. In `record_ad_view` handler — after the successful reward `update`

Find `case "record_ad_view":`. After `commissionToReferrer(supabase, u.referred_by, tgId, reward, "ad_" + network);` insert:

```ts
// Ref-bonus: Adsgram click-verified ads count toward Day1/2/3 bundles.
if (network === "adsgram" && u.referred_by) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: rp } = await supabase.from("referral_bonus_progress")
      .select("*").eq("referee_tg_id", tgId).maybeSingle();
    if (rp && rp.referrer_tg_id) {
      // Which day-slot are we filling next?
      const slotIndex = !rp.day1_credited ? 1 : !rp.day2_credited ? 2 : !rp.day3_credited ? 3 : 0;
      if (slotIndex > 0) {
        const dayKey = `day${slotIndex}_date` as const;
        const cntKey = `day${slotIndex}_ads` as const;
        const doneKey = `day${slotIndex}_credited` as const;
        const activeDate = (rp as any)[dayKey] as string | null;
        let currentCount = Number((rp as any)[cntKey] ?? 0);
        const patch: any = {};
        if (activeDate !== today) {
          // New UTC day — reset the slot counter to 1.
          patch[dayKey] = today; currentCount = 1;
        } else {
          currentCount += 1;
        }
        patch[cntKey] = currentCount;
        if (currentCount >= REF_BONUS_DAILY_ADS_REQUIRED) {
          patch[doneKey] = true;
          patch[`day${slotIndex}_credited_at`] = new Date().toISOString();
          const { data: refU } = await supabase.from("users")
            .select("balance_cloud,total_earned_cloud")
            .eq("tg_id", rp.referrer_tg_id).maybeSingle();
          if (refU) {
            await supabase.from("users").update({
              balance_cloud: Number(refU.balance_cloud) + REF_BONUS_DAY,
              total_earned_cloud: Number(refU.total_earned_cloud) + REF_BONUS_DAY,
            }).eq("tg_id", rp.referrer_tg_id);
          }
        }
        await supabase.from("referral_bonus_progress")
          .update(patch).eq("referee_tg_id", tgId);
      }
    }
  } catch (e) { console.error("ref-bonus ad", e); }
}
```

#### 1d. Add new handler `ref_bonus_progress` (list for the Referral page)

Insert a new `case` next to `list_referrals`:

```ts
case "ref_bonus_progress": {
  const { data } = await supabase.from("referral_bonus_progress")
    .select("*").eq("referrer_tg_id", tgId)
    .order("created_at", { ascending: false });
  return json({ data: data ?? [] });
}
```

### 2. `src/pages/Referral.tsx`

Under the existing invited-user list, render per-invitee progress:

```tsx
const { data: prog } = useQuery({
  queryKey: ["ref-bonus", tgId],
  enabled: !!tgId,
  queryFn: async () => (await apiCall<{ data: any[] }>("ref_bonus_progress")).data ?? [],
});
// Then map prog by referee_tg_id and show:
//  ✓ Mining boot +300
//  ✓/✗ Day 1: x/10 ads → +500
//  ✓/✗ Day 2: x/10 ads → +500
//  ✓/✗ Day 3: x/10 ads → +500
```

### 3. `src/lib/i18n.translations.ts`

Add new keys to every locale:

```ts
refBonus: {
  title: "Invite Bonus (up to +1800)",
  mining: "First mining claim: +300",
  day: "Day {n}: watch 10 ads → +500",
  progress: "{x}/10 ads today",
  done: "Claimed",
}
```

---

## SQL for the NEW BOT (run once in that bot's Supabase)

```sql
create table if not exists public.referral_bonus_progress (
  referee_tg_id       bigint primary key,
  referrer_tg_id      bigint not null,
  mining_credited     boolean not null default false,
  mining_credited_at  timestamptz,
  day1_date           date,
  day1_ads            int not null default 0,
  day1_credited       boolean not null default false,
  day1_credited_at    timestamptz,
  day2_date           date,
  day2_ads            int not null default 0,
  day2_credited       boolean not null default false,
  day2_credited_at    timestamptz,
  day3_date           date,
  day3_ads            int not null default 0,
  day3_credited       boolean not null default false,
  day3_credited_at    timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists ref_bonus_referrer_idx
  on public.referral_bonus_progress(referrer_tg_id);

alter table public.referral_bonus_progress enable row level security;
grant select on public.referral_bonus_progress to authenticated;
grant all    on public.referral_bonus_progress to service_role;
```

ikinci çalıştırılması gereken SQL
'''sql
ALTER TABLE public.referral_bonus_progress
  ADD COLUMN IF NOT EXISTS signup_bonus_credited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signup_bonus_credited_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_day_date date,
  ADD COLUMN IF NOT EXISTS current_day_ads int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS days_completed int NOT NULL DEFAULT 0;

ALTER TABLE public.referral_bonus_progress
  DROP COLUMN IF EXISTS mining_credited,
  DROP COLUMN IF EXISTS mining_credited_at,
  DROP COLUMN IF EXISTS day1_date, DROP COLUMN IF EXISTS day1_ads, DROP COLUMN IF EXISTS day1_credited, DROP COLUMN IF EXISTS day1_credited_at,
  DROP COLUMN IF EXISTS day2_date, DROP COLUMN IF EXISTS day2_ads, DROP COLUMN IF EXISTS day2_credited, DROP COLUMN IF EXISTS day2_credited_at,
  DROP COLUMN IF EXISTS day3_date, DROP COLUMN IF EXISTS day3_ads, DROP COLUMN IF EXISTS day3_credited, DROP COLUMN IF EXISTS day3_credited_at;
  '''


No changes to existing tables. Everything is additive and idempotent.
