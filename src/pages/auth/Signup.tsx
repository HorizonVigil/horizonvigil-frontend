import { useState } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { AuthLayout, FormField } from './AuthLayout';

const STRENGTH_LEVELS = [
  { label: 'Weak', color: 'bg-red-500' },
  { label: 'Fair', color: 'bg-amber-500' },
  { label: 'Good', color: 'bg-amber-500' },
  { label: 'Strong', color: 'bg-emerald-500' },
];

function passwordStrength(password: string): number {
  if (password.length < 8) return 0;
  let score = 1;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score - 1, 3);
}

function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const level = passwordStrength(password);
  const { label, color } = STRENGTH_LEVELS[level];
  return (
    <div className="-mt-1">
      <div className="flex gap-1">
        {STRENGTH_LEVELS.map((s, i) => (
          <div key={s.label} className={`h-1 flex-1 rounded-full ${i <= level ? color : 'bg-slate-200 dark:bg-slate-700'}`} />
        ))}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</div>
    </div>
  );
}

export function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Mirrors Login.tsx -- a logged-out user deep-linking into the app can
  // land on /signup just as easily as /login, so the same "from" state
  // needs honoring here too.
  const from = (location.state as { from?: Location } | null)?.from;
  const redirectTo = from ? `${from.pathname}${from.search}${from.hash}` : '/overview';
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
      // No email confirmation step — signUp() returns an active session directly
      // (as long as "Confirm email" is off in the Supabase project's Auth settings),
      // so a successful signup drops the user straight into the app.
      await signUp(email, password, fullName);
      navigate(redirectTo, { replace: true });
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
        <PasswordStrengthMeter password={password} />
        <FormField label="Confirm password" type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} />
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
