import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { AuthLayout, FormField } from './AuthLayout';

export function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await resetPassword(email);
    setSent(true);
  }

  return (
    <AuthLayout title="Reset your password" subtitle={sent ? undefined : "We'll email you a reset link."}>
      {sent ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">If an account exists for <strong>{email}</strong>, a reset link is on its way.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormField label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          <button type="submit" className="mt-1 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2">Send reset link</button>
        </form>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
        <Link to="/login" className="hover:underline text-brand-600 dark:text-brand-400">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}
