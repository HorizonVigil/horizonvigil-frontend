/**
 * Deliberately dependency-free — navConfig.ts needs this single boolean
 * without pulling in the whole api.ts chain just to render (or hide) one
 * nav item.
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
