export * from "./types";
export * from "./adsgram";
export * from "./monetag";
export * from "./richads";
export * from "./onclicka";
export * from "./gigapup";
export * from "./towerads";

export const ADSGRAM_REWARD_BLOCK = (import.meta.env.VITE_ADSGRM_REWARD_BLOCK as string) || "35930";
export const ADSGRAM_INT_FORCE = (import.meta.env.VITE_ADSGRM_INT_FORCE as string) || "int-35932";
export const ADSGRAM_INT_AUTO = (import.meta.env.VITE_ADSGRM_INT_AUTO as string) || "int-35931";
