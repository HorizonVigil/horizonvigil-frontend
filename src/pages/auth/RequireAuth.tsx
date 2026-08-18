import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useOrg } from '../../lib/orgContext';
import { useState } from 'react';
import { api } from '../../lib/api';

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullScreenSpinner />;
  // Preserves the URL the user was headed to so Login/Signup/MfaChallenge
  // can send them back there instead of always landing on /overview.
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Post-login landing per spec §2: one org -> straight into Overview; zero orgs -> create-org prompt. */
export function RequireOrg() {
  const { orgs, currentOrg, isLoading, refresh } = useOrg();
  if (isLoading) return <FullScreenSpinner />;
  if (orgs.length === 0) return <CreateFirstOrg onCreated={refresh} />;
  if (!currentOrg) return <FullScreenSpinner />;
  return <Outlet />;
}

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="h-6 w-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
    </div>
  );
}

function CreateFirstOrg({ onCreated }: { onCreated: () => void }) {
  const { signOut } = useAuth();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.createOrganization(name.trim());
      // Check if the slug was modified due to duplicate
      if (result?.slug && name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') !== result.slug) {
        setSuccess(`Organization created! Slug was auto-modified to "${result.slug}" because the original was already taken.`);
      } else {
        setSuccess(`Organization "${name.trim()}" created successfully!`);
      }
      // Refresh org list and navigate after a short delay
      setTimeout(() => onCreated(), 1500);
    } catch (err) {
      const errorMessage = (err as Error).message;
      // Handle duplicate slug error gracefully
      if (errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint') || errorMessage.includes('organizations_slug_key')) {
        setError('An organization with this name already exists. Please try a different name.');
      } else if (errorMessage.includes('infinite recursion') || errorMessage.includes('42P17')) {
        setError('Database policy error. Please contact support - the migration may not have been applied yet.');
      } else {
        setError(errorMessage || 'Failed to create organization');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Create your organization</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">This is the top level of your AWS account tree — you'll add folders, projects, and AWS accounts under it next.</p>
          </div>
          <button type="button" onClick={() => void signOut()} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            Sign out
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label htmlFor="org-name" className="sr-only">Organization name</label>
          <input id="org-name" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Acme Corporation" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-green-500">{success}</p>}
          <button type="submit" disabled={loading || !name.trim()} className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
            {loading ? 'Creating…' : 'Create organization'}
          </button>
        </form>
      </div>
    </div>
  );
}
