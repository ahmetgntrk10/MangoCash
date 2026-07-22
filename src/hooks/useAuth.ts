import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiCall, apiConfigured } from "@/lib/api";
import { getInitData, getStartParam } from "@/lib/telegram";
import { computeFingerprintBundle } from "@/lib/fingerprint";
import i18n from "@/lib/i18n";

export interface AuthState {
  loading: boolean;
  error: string | null;
  blocked?: boolean;
  tgId: number | null;
  isAdmin: boolean;
  retry?: () => void;
}

/**
 * Bootstrap auth: call `api?action=init` which validates Telegram initData
 * via HMAC server-side and upserts the user. No Supabase Auth session needed.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true, error: null, tgId: null, isAdmin: false,
  });
  const [attempt, setAttempt] = useState(0);
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!apiConfigured) {
          if (!cancelled)
            setState({
              loading: false, isAdmin: false, tgId: null,
              error:
                "Backend not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel and redeploy.",
            });
          return;
        }
        // Wait up to ~2s for Telegram.WebApp to populate initData on slow devices.
        for (let i = 0; i < 20 && !getInitData(); i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
        if (!getInitData()) {
          if (!cancelled)
            setState({
              loading: false, isAdmin: false, tgId: null,
              error: "Open this app inside Telegram.",
            });
          return;
        }
        const fp = await computeFingerprintBundle().catch(() => null);
        // Retry init up to 3 times on transient network failures
        // (Telegram WebView can drop the first request on cold start).
        let result: any = null;
        let lastErr: any = null;
        // Aggressive retry to survive flaky ISPs / VPN transitions on cold start.
        // "Failed to fetch" is almost always transient (DNS / TCP reset).
        for (let i = 0; i < 6; i++) {
          try {
            result = await apiCall<any>("init", {
              start_param: getStartParam(),
              fp_hash: fp?.fp_hash ?? null,
              webgl_hash: fp?.webgl_hash ?? null,
              audio_hash: fp?.audio_hash ?? null,
              tz: fp?.tz ?? null,
              lang: fp?.lang ?? null,
              platform: fp?.platform ?? null,
            });
            lastErr = null;
            break;
          } catch (e: any) {
            lastErr = e;
            const msg = String(e?.message ?? "");
            if (!/Failed to fetch|NetworkError|network|timeout|load failed/i.test(msg)) break;
            await new Promise((r) => setTimeout(r, Math.min(2500, 500 * (i + 1))));
          }
        }
        if (lastErr) throw lastErr;
        if (cancelled) return;
        if (result?.blocked) {
          setState({
            loading: false, isAdmin: false, tgId: null, blocked: true,
            error: "An account already exists on this device. Please continue with your original account.",
          });
          return;
        }
        // Apply persisted server-side language preference, if any.
        const lang = result.user?.language_code;
        if (lang && typeof lang === "string") {
          const saved = localStorage.getItem("cloudearn_lang");
          if (!saved) {
            i18n.changeLanguage(lang);
            localStorage.setItem("cloudearn_lang", lang);
          }
        }
        qc.setQueryData(["user", result.tg_id], result.user);
        qc.setQueryData(["isAdmin", result.tg_id], result.isAdmin);
        setState({
          loading: false, error: null,
          tgId: result.tg_id, isAdmin: result.isAdmin,
        });
      } catch (e: any) {
        if (!cancelled)
          setState({
            loading: false, isAdmin: false, tgId: null,
            error: e?.message ?? "Auth error",
            retry: () => setAttempt((n) => n + 1),
          });
      }
    })();
    return () => { cancelled = true; };
  }, [qc, attempt]);

  return { ...state, retry: state.retry ?? (() => setAttempt((n) => n + 1)) };
}