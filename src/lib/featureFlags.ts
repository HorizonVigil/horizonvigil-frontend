/**
 * Deliberately dependency-free — anything that imports api.ts also imports
 * supabase.ts, which creates a live Supabase client at module load time and
 * throws if VITE_SUPABASE_URL isn't set (e.g. in the vitest environment,
 * which doesn't load .env). navConfig.ts needs this single boolean without
 * pulling in that whole chain just to render (or hide) one nav item.
 */
export function isBillingEnabled(): boolean {
  return Boolean(import.meta.env.VITE_BILLING_API_URL);
}
