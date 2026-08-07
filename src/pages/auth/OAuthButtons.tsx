import type { OAuthProvider } from '../../lib/auth';

const PROVIDERS: { id: OAuthProvider; label: string; icon: string }[] = [
  { id: 'google', label: 'Google', icon: 'G' },
  { id: 'azure', label: 'Microsoft', icon: 'M' },
  { id: 'github', label: 'GitHub', icon: '⌥' },
];

/**
 * Real Supabase OAuth (signInWithOAuth) -- these buttons genuinely redirect
 * to the provider and back. They only complete successfully once each
 * provider is turned on with real client credentials under Authentication
 * > Providers in the Supabase dashboard; until then, clicking one surfaces
 * Supabase's own "provider is not enabled" error rather than pretending to
 * sign you in.
 */
export function OAuthButtons({ loadingProvider, onSelect }: { loadingProvider: OAuthProvider | null; onSelect: (provider: OAuthProvider) => void }) {
  return (
    <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800">
      <div className="text-xs text-slate-400 dark:text-slate-500 text-center mb-3">Or continue with</div>
      <div className="flex flex-col gap-2">
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            disabled={loadingProvider !== null}
            className="flex items-center justify-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            <span className="w-4 text-center" aria-hidden="true">{p.icon}</span>
            {loadingProvider === p.id ? 'Redirecting…' : p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
