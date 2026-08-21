import { useState } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { useAuth, mfaStepUpRequired } from '../../lib/auth';
import { AuthLayout, FormField } from './AuthLayout';

export function Login() {
  const { signIn, signInWithSSO } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // RequireAuth redirects here with the original destination in router
  // state -- fall back to /overview when there wasn't one (e.g. a direct
  // visit to /login).
  const from = (location.state as { from?: Location } | null)?.from;
  const redirectTo = from ? `${from.pathname}${from.search}${from.hash}` : '/overview';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Enterprise SSO is a real Supabase Auth API call (signInWithSSO, see
  // auth.tsx), not a placeholder -- it just fails honestly with Supabase's
  // own "no SSO provider found for this domain" error until a provider is
  // registered for the customer's domain, same as every other real-but-
  // not-yet-externally-configured integration in this app.
  const [ssoMode, setSsoMode] = useState(false);
  const [ssoEmail, setSsoEmail] = useState('');
  const [ssoLoading, setSsoLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      // A password match alone doesn't finish sign-in for an MFA-enrolled
      // user -- Supabase issues an aal1 session and expects a separate
      // TOTP step-up before treating them as fully authenticated. Forward
      // "from" so the deep link survives that extra step too.
      if (await mfaStepUpRequired()) {
        navigate('/login/mfa', { state: { from } });
      } else {
        navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError((err as Error).message || 'Could not sign in');
    } finally {
      setLoading(false);
    }
  }

  async function handleSsoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const domain = ssoEmail.split('@')[1];
    if (!domain) {
      setError('Enter your full work email address.');
      return;
    }
    setSsoLoading(true);
    try {
      await signInWithSSO(domain);
      // On success the browser navigates away immediately -- no local state
      // to set here, execution doesn't continue past this point.
    } catch (err) {
      setError((err as Error).message || 'Could not start SSO sign-in');
      setSsoLoading(false);
    }
  }

  return (
    <AuthLayout title="Sign in">
      {ssoMode ? (
        <form onSubmit={handleSsoSubmit} className="flex flex-col gap-3">
          <FormField label="Work email" type="email" required value={ssoEmail} onChange={e => setSsoEmail(e.target.value)} placeholder="you@company.com" />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={ssoLoading} className="mt-1 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
            {ssoLoading ? 'Redirecting…' : 'Continue with SSO'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormField label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          <FormField label="Password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading} className="mt-1 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
      <button
        type="button"
        onClick={() => { setSsoMode(m => !m); setError(null); }}
        className="mt-3 text-xs text-slate-500 dark:text-slate-400 hover:underline"
      >
        {ssoMode ? '← Sign in with email and password instead' : 'Sign in with company SSO instead'}
      </button>
      <div className="flex justify-between mt-4 text-xs text-slate-500 dark:text-slate-400">
        <Link to="/signup" className="hover:underline">Create an account</Link>
        <Link to="/forgot-password" className="hover:underline">Forgot password?</Link>
      </div>
    </AuthLayout>
  );
}
