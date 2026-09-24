/**
 * Derives the deployment environment from the configured Supabase project URL.
 *
 * The Supabase project ref is the runtime source of truth rather than a
 * separately maintained VITE_ENVIRONMENT variable, which could drift from the
 * database a build actually targets.
 *
 * Known projects:
 *   - production → dvyoghaqeknyyrdujssi
 *   - test/staging → jhwaujnlgjlvixnvleqc
 *
 * Any other/missing/malformed configuration is treated as `local`.
 *
 * IMPORTANT:
 * This is a UI/environment label, not a security control. Never use it to
 * authorize access, choose privileged credentials, or bypass backend checks.
 */
export type EnvironmentLabel = 'prod' | 'test' | 'local';

const PROD_REF = 'dvyoghaqeknyyrdujssi';
const TEST_REF = 'jhwaujnlgjlvixnvleqc';

function configuredSupabaseUrl(): string {
  const value = import.meta.env.VITE_SUPABASE_URL;

  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Extract the Supabase project reference from a configured URL.
 *
 * The hostname check is deliberately stricter than `url.includes(ref)`.
 * Substring matching could misclassify an unrelated URL that happens to
 * contain the project ref in its path, query string, or another hostname
 * component.
 */
function getSupabaseProjectRef(url: string): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // Supabase-hosted projects normally use `<project-ref>.supabase.co`.
    const hostname = parsed.hostname.toLowerCase();
    const suffix = '.supabase.co';

    if (!hostname.endsWith(suffix)) {
      return null;
    }

    const ref = hostname.slice(0, -suffix.length);

    if (!ref || ref.includes('.')) {
      return null;
    }

    return ref;
  } catch {
    return null;
  }
}

export function getEnvironmentLabel(): EnvironmentLabel {
  const projectRef = getSupabaseProjectRef(
    configuredSupabaseUrl(),
  );

  if (projectRef === PROD_REF) {
    return 'prod';
  }

  if (projectRef === TEST_REF) {
    return 'test';
  }

  return 'local';
}

/**
 * Exported only for diagnostics/tests. Callers should normally use
 * getEnvironmentLabel().
 */
export function getConfiguredSupabaseProjectRef(): string | null {
  return getSupabaseProjectRef(configuredSupabaseUrl());
}
