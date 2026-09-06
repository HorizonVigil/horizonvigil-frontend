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

/**
 * The mock hosted-checkout screen simulates payment success/failure with no
 * real payment provider behind it (see its own doc comment in
 * MockCheckout.tsx) — reachable by anyone who knows the URL unless gated.
 * Off by default; set VITE_MOCK_CHECKOUT_ENABLED=true only in test/staging
 * environments that don't have a real payment provider connected yet.
 */
export function isMockCheckoutEnabled(): boolean {
  return import.meta.env.VITE_MOCK_CHECKOUT_ENABLED === 'true';
}

/**
 * Cloud-only go-live mode: temporarily hides non-cloud modules (Vulnerability
 * Management, Custom Dashboards, Issues, Incidents, Users & Groups,
 * Organization Management, Subscription) from the sidebar and Cmd+K. This is
 * a render-layer-only filter (see getVisibleModules()/CommandPalette.tsx) --
 * it deliberately does NOT remove anything from NAV_MODULES itself, so
 * ProtectedRoute's independent module lookup is untouched and every hidden
 * page stays reachable by direct URL for anyone who already had access. Off
 * (full nav) unless explicitly set -- flip VITE_CLOUD_ONLY_MODE back to
 * unset/false to instantly restore the full nav, nothing to undo in code.
 */
export function isCloudOnlyMode(): boolean {
  return import.meta.env.VITE_CLOUD_ONLY_MODE === 'true';
}
