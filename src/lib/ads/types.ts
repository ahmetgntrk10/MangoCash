export type AdNetwork = "adsgram" | "monetag" | "richads" | "onclicka" | "gigapup";
export type AdResult = { ok: true; reward?: number } | { ok: false; reason: "no-fill" | "closed-early" | "error"; message?: string };

export interface AdInitData { network: AdNetwork; reward: number; cooldownMs: number; }
