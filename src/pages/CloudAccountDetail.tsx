import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { api, ApiError } from '../lib/api';
import { AwsAccountDetail } from './AwsAccountDetail';
import { GcpProjectDetail } from './GcpProjectDetail';

/**
 * One route (`/cloud-accounts/:id`) for both providers — the merged
 * Inventory table (CloudAccounts.tsx) no longer tells you up front which
 * kind of row you clicked, and account IDs are unique across the whole
 * cloud_connections table regardless of provider, so this probes AWS first
 * (the far more common case) and falls back to GCP on a 404 rather than
 * needing a ?provider= query param or a second URL segment.
 *
 * Delegates to the existing AwsAccountDetail/GcpProjectDetail components
 * unchanged rather than merging their ~750 combined lines of provider-
 * specific tabs (Cost, CUR, Permissions, Sync History, Recommendations —
 * none of which gcp-accounts-api has an equivalent of yet) into one file.
 * Both already read `id` via their own useParams, which still resolves
 * correctly rendered as plain children here since no extra <Route> is
 * introduced between this component and the router.
 */
export function CloudAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [provider, setProvider] = useState<'aws' | 'gcp' | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setProvider(null);
    setNotFound(false);
    (async () => {
      try {
        await api.getAccount(id);
        if (!cancelled) setProvider('aws');
      } catch (awsErr) {
        if (awsErr instanceof ApiError && awsErr.status !== 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        try {
          await api.getGcpAccount(id);
          if (!cancelled) setProvider('gcp');
        } catch {
          if (!cancelled) setNotFound(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (notFound) {
    return (
      <div>
        <FilterBar title="Account Not Found" breadcrumb={<Link to="/cloud-accounts" className="text-xs text-slate-400 hover:underline">← Cloud Accounts</Link>} showAccountFilter={false} />
        <p className="text-sm text-slate-400 py-10 text-center">This account or project doesn't exist, or you don't have access to it.</p>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      </div>
    );
  }

  return provider === 'gcp' ? <GcpProjectDetail /> : <AwsAccountDetail />;
}
