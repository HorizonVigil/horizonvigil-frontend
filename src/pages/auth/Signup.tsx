import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type OAuthProvider } from '../../lib/auth';
import { AuthLayout, FormField } from './AuthLayout';
import { OAuthButtons } from './OAuthButtons';

export function Signup() {
  const { signUp, signInWithOAuth } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);

  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setOauthLoading(provider);
    try {
      await signInWithOAuth(provider);
    } catch (err) {
      setError((err as Error).message || `Could not sign up with ${provider}`);
      setOauthLoading(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // No email confirmation step — signUp() returns an active session directly
      // (as long as "Confirm email" is off in the Supabase project's Auth settings),
      // so a successful signup drops the user straight into the app.
      await signUp(email, password, fullName);
      navigate('/overview');
    } catch (err) {
      setError((err as Error).message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Create your account">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <FormField label="Full name" required value={fullName} onChange={e => setFullName(e.target.value)} />
        <FormField label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <FormField label="Password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={loading} className="mt-1 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
        Already have an account? <Link to="/login" className="hover:underline text-brand-600 dark:text-brand-400">Sign in</Link>
      </p>
      <OAuthButtons loadingProvider={oauthLoading} onSelect={handleOAuth} />
    </AuthLayout>
  );
}
