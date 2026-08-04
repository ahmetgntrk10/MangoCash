import { useQuery } from "@tanstack/react-query";
import { apiCall } from "@/lib/api";

export interface AppUser {
  id: string;
  tg_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  photo_url: string | null;
  balance_cloud: number;
  balance_usdt: number;
  total_earned_cloud: number;
  ref_earnings_cloud: number;
  referral_count: number;
  referred_by: number | null;
  binance_uid: string | null;
  ton_address: string | null;
  faucetpay_address: string | null;
  last_daily_reward_at: string | null;
  notify_market?: boolean;
}

export function useUser(tgId: number | null) {
  return useQuery({
    queryKey: ["user", tgId],
    enabled: !!tgId,
    queryFn: async (): Promise<AppUser | null> => {
      if (!tgId) return null;
      const res = await apiCall<{ user: AppUser | null }>("get_user");
      return res.user;
    },
    staleTime: 5 * 60_000,
  });
}

// init zaten isAdmin dönüyor ve cache'i dolduruyor; ikinci get_user çağrısı yok.
export function useIsAdmin(tgId: number | null) {
  return useQuery({
    queryKey: ["isAdmin", tgId],
    enabled: !!tgId,
    queryFn: async () => false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
