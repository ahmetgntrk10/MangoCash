// Legacy shim. All data access now goes through the `api` Edge Function
// (see src/lib/api.ts). Kept only so older imports do not break the build.
export const supabaseConfigured = Boolean(
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) &&
    ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
      (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)),
);