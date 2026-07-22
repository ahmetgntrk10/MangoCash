export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export function getTg(): any {
  return (window as any).Telegram?.WebApp;
}

export function getInitData(): string {
  return getTg()?.initData || "";
}

export function getTgUser(): TgUser | null {
  const u = getTg()?.initDataUnsafe?.user;
  return u ?? null;
}

export function getStartParam(): string | null {
  return getTg()?.initDataUnsafe?.start_param ?? null;
}

export function haptic(kind: "light" | "medium" | "heavy" | "success" | "error" = "light") {
  const tg = getTg();
  try {
    if (kind === "success" || kind === "error") tg?.HapticFeedback?.notificationOccurred(kind);
    else tg?.HapticFeedback?.impactOccurred(kind);
  } catch {}
}

export function shareUrl(url: string, text: string) {
  const tg = getTg();
  const shareLink = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(shareLink);
  else window.open(shareLink, "_blank");
}

export function openLink(url: string) {
  const tg = getTg();
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank");
}

/** 1 ☁️ = 0.00001 USDT */
export const CLOUD_TO_USDT = 0.00001;
export function cloudToUsdt(cloud: number | bigint): number {
  return Number(cloud) * CLOUD_TO_USDT;
}
export function formatUsdt(v: number): string {
  return v.toFixed(6).replace(/\.?0+$/, "");
}