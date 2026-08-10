import type { OAuthProvider } from '../../lib/auth';

const PROVIDERS: { id: OAuthProvider; label: string; icon: string }[] = [
  { id: 'google', label: 'Google', icon: 'G' },
  { id: 'azure', label: 'Microsoft', icon: 'M' },
  { id: 'github', label: 'GitHub', icon: '⌥' },
];

/**
 * Real Supabase OAuth (signInWithOAuth) -- genuinely redirects to the
 * provider and back, once a provider is turned on with real client
 * credentials under Authentication > Providers in the Supabase dashboard.
 * Confirmed via GoTrue's own /auth/v1/settings that none of google/azure/
 * github are currently enabled on this project -- clicking any of them
 * sent the whole browser tab to Supabase's bare /authorize endpoint, which
 * has no app UI to render its error into, so the user just saw raw JSON on
 * Supabase's own domain. Disabled with a clear label until real OAuth app
 * credentials exist for at least one provider, matching this codebase's
 * "real: false renders disabled with a reason, never a dead/fake link"
 * rule (see navConfig.ts) applied to a flow that leaves the app entirely,
 * not just an in-app placeholder page.
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
            disabled
            title="Not configured yet — sign in with email and password for now."
            className="flex items-center justify-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 py-2 text-sm font-medium text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60"
          >
            <span className="w-4 text-center" aria-hidden="true">{p.icon}</span>
            {p.label}
            <span className="text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800">Soon</span>
          </button>
        ))}
      </div>
    </div>
  );
}
