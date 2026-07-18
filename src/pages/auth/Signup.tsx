import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { AuthLayout, FormField } from './AuthLayout';

export function Signup() {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signUp(email, password, fullName);
      setDone(true);
    } catch (err) {
      setError((err as Error).message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthLayout title="Check your inbox">
        <p className="text-sm text-slate-600 dark:text-slate-300">We sent a confirmation link to <strong>{email}</strong>. Confirm your email, then <Link to="/login" className="text-brand-600 dark:text-brand-400 hover:underline">sign in</Link>.</p>
      </AuthLayout>
    );
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
    </AuthLayout>
  );
}
