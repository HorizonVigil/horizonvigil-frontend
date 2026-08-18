import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useOrg } from '../../lib/orgContext';
import { api, type ApiError } from '../../lib/api';
import { AuthLayout } from './AuthLayout';

type Preview = { orgName: string; inviterName: string; role: string; email: string };

/**
 * Reachable logged-out, logged-in-with-no-orgs, or fully logged-in -- so
 * it's mounted at the top level in App.tsx, outside RequireAuth/RequireOrg.
 * A fresh signup with zero orgs would otherwise get force-routed into
 * RequireOrg's CreateFirstOrg screen before ever reaching this page.
 */
export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { refresh: refreshOrgs, setCurrentOrg } = useOrg();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoadError('This invite link is missing its token.'); return; }
    api.getInvitePreview(token)
      .then(setPreview)
      .catch((err: ApiError) => setLoadError(err.message || 'This invite link is invalid or has expired.'));
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    setAcceptError(null);
    try {
      const result = await api.acceptInvite(token);
      // Newly-invited user's only org: refresh() alone already selects it
      // (falls back to fetchedOrgs[0]). An existing user joining an
      // *additional* org needs an explicit switch, since refresh() keeps
      // whichever org was already active.
      const { organizations } = await api.getMyOrganizations();
      const joined = organizations.find(o => o.id === result.orgId);
      if (joined) setCurrentOrg(joined);
      else await refreshOrgs();
      navigate('/overview', { replace: true });
    } catch (err) {
      setAcceptError((err as ApiError).message || 'Failed to accept invite.');
    } finally {
      setAccepting(false);
    }
  }

  const fromLocation = { pathname: '/accept-invite', search: `?token=${token}`, hash: '' };

  if (loadError) {
    return (
      <AuthLayout title="Invite link">
        <p className="text-sm text-red-500">{loadError}</p>
        <Link to="/" className="text-sm text-brand-600 dark:text-brand-400 hover:underline mt-4 inline-block">Go to homepage</Link>
      </AuthLayout>
    );
  }

  if (!preview || authLoading) {
    return (
      <AuthLayout title="Loading invite…">
        <div className="h-5 w-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mx-auto" />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="You've been invited" subtitle={`${preview.inviterName} invited you to join ${preview.orgName} as ${preview.role}.`}>
      {acceptError && <p className="text-sm text-red-500 mb-3">{acceptError}</p>}
      {isAuthenticated ? (
        <button
          onClick={() => void handleAccept()}
          disabled={accepting}
          className="w-full rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2"
        >
          {accepting ? 'Joining…' : `Accept and join ${preview.orgName}`}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Sign in or create an account with <strong>{preview.email}</strong> to accept.</p>
          <Link
            to="/signup"
            state={{ from: fromLocation }}
            className="text-center rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2"
          >
            Create account
          </Link>
          <Link
            to="/login"
            state={{ from: fromLocation }}
            className="text-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium py-2"
          >
            Sign in
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
