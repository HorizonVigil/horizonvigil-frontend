/**
 * Dependency-free product feature flags.
 *
 * This module intentionally has no runtime dependency on the API/Supabase
 * client. Navigation and other configuration code can import these helpers
 * safely in Vitest and other environments where the application's live
 * Supabase client is not initialized.
 *
 * IMPORTANT:
 * These flags control client-side presentation/availability only. They are
 * never an authorization boundary. Backend authentication, tenant scope,
 * entitlements, and permissions must be enforced independently by the
 * relevant server endpoints.
 */

type ViteEnv = Record<string, unknown>;

const env = (import.meta as ImportMeta & { env?: ViteEnv }).env ?? {};

function readStringEnv(name: string): string {
  const value = env[name];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Parse a strict opt-in boolean environment variable.
 *
 * Only the literal string "true" enables the feature. Missing, empty,
 * malformed, or differently-cased values stay disabled.
 */
function readBooleanEnv(name: string): boolean {
  return readStringEnv(name) === 'true';
}

/**
 * Billing is considered configured when a billing API URL is present.
 *
 * This intentionally checks configuration rather than making a network
 * request. Availability and authorization are still determined by the
 * backend.
 */
export function isBillingEnabled(): boolean {
  return readStringEnv('VITE_BILLING_API_URL').length > 0;
}

/**
 * Mock hosted checkout is an explicitly opt-in test/staging feature.
 *
 * Never enable this implicitly based on environment naming alone.
 */
export function isMockCheckoutEnabled(): boolean {
  return readBooleanEnv('VITE_MOCK_CHECKOUT_ENABLED');
}

/**
 * Cloud-only V1 presentation mode.
 *
 * This flag may hide modules from navigation/command surfaces. It must not be
 * interpreted as disabling routes or backend authorization.
 */
export function isCloudOnlyMode(): boolean {
  return readBooleanEnv('VITE_CLOUD_ONLY_MODE');
}

/**
 * Current V1 vulnerability/scanner data gate.
 *
 * At present, vulnerability/scanner data is tied to cloud-only mode because
 * the current V1 release posture intentionally excludes the V2 vulnerability
 * data surfaces.
 *
 * Keep this as a named feature gate so V1 surfaces use one shared decision
 * instead of scattering `isCloudOnlyMode()` checks throughout the UI.
 *
 * When vulnerability management becomes an independently entitled V2
 * capability, replace the implementation here with that entitlement/feature
 * source without changing callers.
 */
export function isVulnerabilityDataEnabled(): boolean {
  return !isCloudOnlyMode();
}
