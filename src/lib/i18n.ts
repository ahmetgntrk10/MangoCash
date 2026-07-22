import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { T } from "./i18n.translations";

const en = {
  common: {
    home: "Home", task: "Task", earn: "Earn", referral: "Referral", profile: "Profile",
    balance: "Main Balance", convert: "Convert", withdraw: "Withdraw", setAddress: "Set Address",
    dailyReward: "Daily Reward", linkInBio: "Link in Bio", claim: "Claim", admin: "Admin",
    copy: "Copy", copied: "Copied!", share: "Share", invites: "Invites", earned: "Earned",
    save: "Save", cancel: "Cancel", loading: "Loading…",
    noAd: "No ads available right now. Please try again later.",
    insufficientBalance: "Insufficient balance",
    success: "Success",
    error: "Error",
    close: "Close",
    backToHome: "Back to Home",
  },
  earn: {
    title: "Play & Earn",
    xoxCard: "XOX vs Minimax",
    xoxDesc: "Beat the AI to win — every match ends with one mandatory ad.",
    entryFee: "Entry fee",
    rules: "Rules",
    ruleLose: "Lose: forfeit entry",
    ruleDraw: "Draw: entry refunded",
    ruleWin: "Win: receive reward",
    start: "Start",
    youWin: "You win!", youLose: "You lose", draw: "Draw", playAgain: "Play again", reward: "Reward",
    attemptsLeft: "Attempts left today",
  },
  task: {
    social: "Social", exclusive: "Exclusive", ads: "Ads", partners: "Partners", addYour: "Add Your Task",
    adsTitle: "Watch ads to earn",
    adsSubtitle: "Daily limits reset at 00:00 UTC",
    watched: "Watched", cooldown: "Cooldown", slotsLeft: "left today",
    watchNow: "Watch",
    open: "Open",
    verify: "Verify",
    alreadyDone: "Task already completed.",
    notMember: "You haven't joined the channel yet.",
    botMissing: "The bot is not in the channel or has no permissions.",
    tooSoon: "Please wait a bit longer before verifying.",
    notStarted: "Open the task first.",
    invalidChannel: "Channel is not configured correctly.",
    dailyLimit: "Daily limit reached.",
  },
  ref: {
    headline: "Earn +1500 $CLOUD per referral — receive a lifetime 10% commission on everything your friend earns.",
    rule: "Each invite +300 ☁️. When your invitee watches 3 ads in Tasks → Ads, you get +700 ☁️ more. Plus lifetime 10% commission.",
    progress: "{{done}}/3 ads",
    commission: "Commission",
    yourLink: "Your referral link",
    invitedUsers: "Invited Users",
    totalInvites: "Total Invites",
    totalEarned: "Total Earned",
    shareMsg: "Join me on CloudEarn and earn a lifetime 15% commission on everything your friends earn.",
  },
  profile: {
    finance: "Finance", community: "Community", settings: "Settings",
    txHistory: "Transaction History", officialChannel: "Official Channel", paymentsChannel: "Payments Channel",
    promoCode: "Promo Code", support: "Support", language: "Language",
    bioLink: "Link in Bio",
    bioVerified: "Bio verified",
    bioMissing: "Link not found in your Telegram bio",
    feeLabel: "Fee", netLabel: "You receive",
    needRefs: "You need at least {{n}} referrals to withdraw.",
    minWithdraw: "Min withdraw: {{n}} USDT",
  },
  adModal: {
    title: "Ad Closed Too Early",
    desc: "You closed the ad without clicking. To earn the reward, tap the ad link and stay on the page.",
    step1: "Tap Watch — ad opens",
    step2: "Tap the link or 'View' inside the ad",
    step3: "Stay on the opened page at least 10 seconds, then come back",
    warning: "Closing without clicking = no reward.",
    understood: "Understood",
  },
  withdraw: {
    title: "Withdraw USDT",
    method: "Method",
    amount: "Amount",
    submit: "Request Withdrawal",
    confirmAd: "Watch ad to confirm withdrawal",
  },
  promo: { enter: "Enter promo code", redeem: "Redeem", needAd: "Watch an ad to validate the code." },
  admin: {
    panel: "Admin Panel",
    users: "Users", tasks: "Tasks", payments: "Payments", admins: "Admins",
    promos: "Promo", announce: "Announce",
    tonPending: "FaucetPay Pending", binancePending: "Binance Pending", history: "History",
    bulkPay: "Bulk Pay All",
  },
};

const tr = {
  common: {
    home: "Ana", task: "Görev", earn: "Kazan", referral: "Davet", profile: "Profil",
    balance: "Ana Bakiye", convert: "Dönüştür", withdraw: "Çekim", setAddress: "Adres Ayarla",
    dailyReward: "Günlük Ödül", linkInBio: "Bio'da Link", claim: "Al", admin: "Admin",
    copy: "Kopyala", copied: "Kopyalandı!", share: "Paylaş", invites: "Davet", earned: "Kazanılan",
    save: "Kaydet", cancel: "İptal", loading: "Yükleniyor…",
    noAd: "Şu an reklam yok. Lütfen daha sonra tekrar deneyin.",
    insufficientBalance: "Yetersiz bakiye",
    success: "Başarılı",
    error: "Hata",
    close: "Kapat",
    backToHome: "Ana sayfaya dön",
  },
  earn: {
    title: "Oyna ve Kazan",
    xoxCard: "XOX vs Minimax",
    xoxDesc: "Yapay zekayı yen — her maç sonunda 1 zorunlu reklam izlenir.",
    entryFee: "Giriş ücreti",
    rules: "Kurallar",
    ruleLose: "Kaybedersen: giriş ücretini kaybedersin",
    ruleDraw: "Berabere: giriş ücreti iade",
    ruleWin: "Kazanırsan: ödül alırsın",
    start: "Başla",
    youWin: "Kazandın!", youLose: "Kaybettin", draw: "Berabere", playAgain: "Tekrar oyna", reward: "Ödül",
    attemptsLeft: "Bugün kalan hak",
  },
  task: {
    social: "Sosyal", exclusive: "Özel", ads: "Reklam", partners: "Partnerler", addYour: "Görev Ekle",
    adsTitle: "Reklam izleyerek kazan",
    adsSubtitle: "Günlük limitler 00:00 UTC'de sıfırlanır",
    watched: "İzlendi", cooldown: "Bekleme", slotsLeft: "bugün kaldı",
    watchNow: "İzle",
    open: "Aç",
    verify: "Doğrula",
    alreadyDone: "Bu görev zaten tamamlandı.",
    notMember: "Henüz kanala katılmadınız.",
    botMissing: "Bot kanalda ekli değil veya yetkisi yok.",
    tooSoon: "Doğrulamadan önce biraz daha bekleyin.",
    notStarted: "Önce görevi açın.",
    invalidChannel: "Kanal doğru ayarlanmamış.",
    dailyLimit: "Günlük limite ulaşıldı.",
  },
  ref: {
    headline: "Her davet için +1500 $CLOUD — arkadaşının tüm kazancından ömür boyu %10 komisyon.",
    rule: "Her davette +300 ☁️. Davet ettiğin Task → Ads kısmında 3 reklam izlerse +700 ☁️ daha alırsın. Ayrıca ömür boyu %10 komisyon.",
    progress: "{{done}}/3 reklam",
    commission: "Komisyon",
    yourLink: "Davet linkin",
    invitedUsers: "Davet Edilenler",
    totalInvites: "Toplam Davet",
    totalEarned: "Toplam Kazanılan",
    shareMsg: "Join me on CloudEarn and earn a lifetime 15% commission on everything your friends earn.",
  },
  profile: {
    finance: "Finans", community: "Topluluk", settings: "Ayarlar",
    txHistory: "İşlem Geçmişi", officialChannel: "Resmi Kanal", paymentsChannel: "Ödeme Kanalı",
    promoCode: "Promo Kod", support: "Destek", language: "Dil",
    bioLink: "Bio'da Link",
    bioVerified: "Bio doğrulandı",
    bioMissing: "Telegram bio'nuzda link bulunamadı",
    feeLabel: "Komisyon", netLabel: "Alacağın",
    needRefs: "Çekim yapmak için en az {{n}} davetin olmalı.",
    minWithdraw: "Minimum çekim: {{n}} USDT",
  },
  adModal: {
    title: "Reklam Çok Erken Kapatıldı",
    desc: "Reklamı tıklamadan kapattın. Ödülünü kazanmak için reklam bağlantısına dokun ve sayfada kal.",
    step1: "İzle'ye dokun — reklam ekranda açılır",
    step2: "Reklamın içindeki bağlantıya veya 'View' butonuna dokun",
    step3: "Açılan sayfada en az 10 saniye kal, sonra geri dön",
    warning: "Tıklamadan kapatmak = ödül yok.",
    understood: "Anladım",
  },
  withdraw: {
    title: "USDT Çekimi",
    method: "Yöntem",
    amount: "Miktar",
    submit: "Çekim Talep Et",
    confirmAd: "Çekimi onaylamak için reklam izle",
  },
  promo: { enter: "Promo kodu gir", redeem: "Kullan", needAd: "Kodu doğrulamak için reklam izle." },
  admin: {
    panel: "Admin Panel",
    users: "Kullanıcılar", tasks: "Görevler", payments: "Ödemeler", admins: "Adminler",
    promos: "Promo", announce: "Duyuru",
    tonPending: "FaucetPay Bekliyor", binancePending: "Binance Bekliyor", history: "Geçmiş",
    bulkPay: "Hepsini Öde",
  },
};

export const SUPPORTED_LANGS = [
  { code: "en", label: "English" }, { code: "tr", label: "Türkçe" },
  { code: "hi", label: "हिन्दी" }, { code: "ar", label: "العربية" },
  { code: "ru", label: "Русский" }, { code: "bn", label: "বাংলা" },
  { code: "es", label: "Español" }, { code: "zh", label: "中文" },
  { code: "ko", label: "한국어" }, { code: "ja", label: "日本語" },
  { code: "de", label: "Deutsch" }, { code: "id", label: "Indonesia" },
  { code: "it", label: "Italiano" }, { code: "fr", label: "Français" },
  { code: "uz", label: "Oʻzbekcha" }, { code: "az", label: "Azərbaycan" },
  { code: "vi", label: "Tiếng Việt" },
];

// Build resources: per-language translation pack from T, fallback to en for
// any language not present. Local `en`/`tr` objects (above) are kept for
// backwards compatibility but the runtime source of truth is T.
const resources: Record<string, { translation: any }> = {};
for (const { code } of SUPPORTED_LANGS) {
  resources[code] = { translation: T[code] ?? T.en };
}

const tg = (window as any).Telegram?.WebApp;
const initialLang =
  localStorage.getItem("cloudearn_lang") ||
  tg?.initDataUnsafe?.user?.language_code ||
  "en";

i18n.use(initReactI18next).init({
  resources,
  lng: resources[initialLang] ? initialLang : "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
