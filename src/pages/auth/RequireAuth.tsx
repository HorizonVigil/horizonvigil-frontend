import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useOrg } from '../../lib/orgContext';
import { useState } from 'react';
import { api } from '../../lib/api';

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <FullScreenSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
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
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.createOrganization(name.trim());
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Create your organization</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">This is the top level of your AWS account tree — you'll add folders, projects, and AWS accounts under it next.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Acme Corporation" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading || !name.trim()} className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
            {loading ? 'Creating…' : 'Create organization'}
          </button>
        </form>
      </div>
    </div>
  );
}
