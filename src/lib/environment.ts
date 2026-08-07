/**
 * Dependency-free (same reasoning as featureFlags.ts) — derives a human
 * label from the actual configured Supabase project ref rather than a
 * separate env var that could drift out of sync with which database this
 * build is really pointed at. dvyoghaqeknyyrdujssi is prod, jhwaujnlgjlvixnvleqc
 * is staging/test — see cloudops-shared-lib session history for both refs.
 */
export type EnvironmentLabel = 'prod' | 'test' | 'local';

const PROD_REF = 'dvyoghaqeknyyrdujssi';
const TEST_REF = 'jhwaujnlgjlvixnvleqc';

export function getEnvironmentLabel(): EnvironmentLabel {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  if (url.includes(PROD_REF)) return 'prod';
  if (url.includes(TEST_REF)) return 'test';
  return 'local';
}
