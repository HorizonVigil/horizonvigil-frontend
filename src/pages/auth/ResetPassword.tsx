import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout, FormField } from './AuthLayout';

const AUTH_BASE = `${import.meta.env.VITE_USERS_API_URL || ''}/api/auth`;

/**
 * Reached from the password-reset email link (/login/reset?token=…). The
 * token is a 30-minute signed token minted by /api/auth/forgot-password;
 * this posts it plus the new password to /api/auth/reset-password.
 */
export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('This reset link is missing its token. Request a new one.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${AUTH_BASE}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not reset password');
      setDone(true);
      // Allow the success state to render before redirecting.
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError((err as Error).message || 'Could not reset password. The link may have expired — request a new one.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Set a new password" subtitle={done ? undefined : 'Choose a new password for your account.'}>
      {done ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Your password has been updated successfully.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Redirecting you to sign in…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormField label="New password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
          <FormField label="Confirm new password" type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading} className="mt-1 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
        <Link to="/login" className="hover:underline text-brand-600 dark:text-brand-400">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}