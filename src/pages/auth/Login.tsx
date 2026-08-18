import { useState } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { useAuth, mfaStepUpRequired, type OAuthProvider } from '../../lib/auth';
import { AuthLayout, FormField } from './AuthLayout';
import { OAuthButtons } from './OAuthButtons';

export function Login() {
  const { signIn, signInWithOAuth } = useAuth();
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
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);

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

  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setOauthLoading(provider);
    try {
      await signInWithOAuth(provider);
    } catch (err) {
      setError((err as Error).message || `Could not sign in with ${provider}`);
      setOauthLoading(null);
    }
  }

  return (
    <AuthLayout title="Sign in">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <FormField label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <FormField label="Password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={loading} className="mt-1 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="flex justify-between mt-4 text-xs text-slate-500 dark:text-slate-400">
        <Link to="/signup" className="hover:underline">Create an account</Link>
        <Link to="/forgot-password" className="hover:underline">Forgot password?</Link>
      </div>
      <OAuthButtons loadingProvider={oauthLoading} onSelect={handleOAuth} />
    </AuthLayout>
  );
}
