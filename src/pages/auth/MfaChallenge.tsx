import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, type Location } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { mfaStepUpRequired } from '../../lib/auth';
import { verifyTotp } from '../../lib/mfa';
import { AuthLayout } from './AuthLayout';

/**
 * Reached only mid-login, after a correct password but before the session
 * reaches aal2 -- Login.tsx is the only place that navigates here. A user
 * who lands on this URL any other way (bookmark, back button) either
 * doesn't need a step-up (redirected onward) or isn't authenticated at all
 * (RequireAuth in App.tsx handles that case upstream).
 */
export function MfaChallenge() {
  const navigate = useNavigate();
  const location = useLocation();
  // Login.tsx forwards the pre-login "from" location in router state so a
  // deep link survives the MFA step-up, not just the password step.
  const from = (location.state as { from?: Location } | null)?.from;
  const redirectTo = from ? `${from.pathname}${from.search}${from.hash}` : '/overview';
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const needed = await mfaStepUpRequired().catch(() => false);
      if (cancelled) return;
      if (!needed) { setSkip(true); return; }
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (listError || !data.totp[0]) { setError('No verified authenticator found for this account.'); setChecking(false); return; }
      setFactorId(data.totp[0].id);
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (skip) return <Navigate to={redirectTo} replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setLoading(true);
    try {
      await verifyTotp(factorId, code);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError((err as Error).message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Two-factor verification" subtitle="Enter the 6-digit code from your authenticator app.">
      {checking ? (
        <p className="text-sm text-slate-400">Checking…</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label htmlFor="mfa-code" className="sr-only">6-digit authentication code</label>
          <input
            id="mfa-code"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoFocus
            placeholder="000000"
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-center text-lg tracking-[0.5em] text-slate-900 dark:text-white"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading || code.length !== 6} className="mt-1 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
