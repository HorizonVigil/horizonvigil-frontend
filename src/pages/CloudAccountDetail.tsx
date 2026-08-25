/**
 * Production note:
 * The provider probe treats only HTTP 404 as "try the next provider".
 * Authentication, authorization, rate-limit, network, and backend failures
 * are surfaced as errors so an unavailable API is never presented as a
 * missing account. Request cancellation also prevents an old route from
 * changing the UI after the user navigates to another account.
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { api, ApiError } from '../lib/api';
import { AwsAccountDetail } from './AwsAccountDetail';
import { GcpProjectDetail } from './GcpProjectDetail';
import { AzureAccountDetail } from './AzureAccountDetail';

/**
 * One route (`/cloud-accounts/:id`) for all three providers — the merged
 * Inventory table (CloudAccounts.tsx) no longer tells you up front which
 * kind of row you clicked, and account IDs are unique across the whole
 * cloud_connections table regardless of provider, so this probes AWS first
 * (the far more common case), then GCP, then Azure on successive 404s
 * rather than needing a ?provider= query param or a second URL segment.
 *
 * Delegates to the existing AwsAccountDetail/GcpProjectDetail/
 * AzureAccountDetail components unchanged rather than merging their
 * combined lines of provider-specific tabs (Cost, CUR, Permissions,
 * Sync History, Recommendations — most of which gcp-accounts-api and
 * azure-accounts-api have no equivalent of yet) into one file. All three
 * already read `id` via their own useParams, which still resolves
 * correctly rendered as plain children here since no extra <Route> is
 * introduced between this component and the router.
 */
export function CloudAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [provider, setProvider] = useState<'aws' | 'gcp' | 'azure' | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setProvider(null);
    setNotFound(false);
    setLoadError(null);

    const accountId = id?.trim();
    if (!accountId) {
      setNotFound(true);
      return () => { cancelled = true; };
    }

    const isNotFound = (error: unknown): boolean =>
      error instanceof ApiError && error.status === 404;

    const errorMessage = (error: unknown): string =>
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unable to load the cloud account.';

    const probe = async () => {
      // A 404 means "not this provider", so continue probing. Any other
      // response is a real failure and must not be misreported as "not found".
      try {
        await api.getAccount(accountId);
        if (!cancelled) setProvider('aws');
        return;
      } catch (awsErr) {
        if (!isNotFound(awsErr)) {
          if (!cancelled) setLoadError(errorMessage(awsErr));
          return;
        }
      }

      try {
        await api.getGcpAccount(accountId);
        if (!cancelled) setProvider('gcp');
        return;
      } catch (gcpErr) {
        if (!isNotFound(gcpErr)) {
          if (!cancelled) setLoadError(errorMessage(gcpErr));
          return;
        }
      }

      try {
        await api.getAzureAccount(accountId);
        if (!cancelled) setProvider('azure');
      } catch (azureErr) {
        if (cancelled) return;
        if (isNotFound(azureErr)) {
          setNotFound(true);
        } else {
          setLoadError(errorMessage(azureErr));
        }
      }
    };

    void probe();

    return () => {
      cancelled = true;
    };
  }, [id, retryToken]);


  if (loadError) {
    return (
      <div>
        <FilterBar
          title="Unable to Load Account"
          breadcrumb={
            <Link
              to="/cloud-accounts"
              className="text-xs text-slate-400 hover:underline"
            >
              ← Cloud Accounts
            </Link>
          }
          showAccountFilter={false}
          showRegionFilter={false}
          showDateFilter={false}
        />
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-red-500 dark:text-red-400">{loadError}</p>
          <button
            type="button"
            onClick={() => setRetryToken(token => token + 1)}
            className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div>
        <FilterBar title="Account Not Found" breadcrumb={<Link to="/cloud-accounts" className="text-xs text-slate-400 hover:underline">← Cloud Accounts</Link>} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />
        <p className="text-sm text-slate-400 py-10 text-center">This account or project doesn't exist, or you don't have access to it.</p>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="flex flex-col gap-5">
        <FilterBar
          title="Cloud Account"
          breadcrumb={
            <Link
              to="/cloud-accounts"
              className="text-xs text-slate-400 hover:underline"
            >
              ← Cloud Accounts
            </Link>
          }
          showAccountFilter={false}
          showRegionFilter={false}
          showDateFilter={false}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      </div>
    );
  }

  if (provider === 'gcp') return <GcpProjectDetail />;
  if (provider === 'azure') return <AzureAccountDetail />;
  return <AwsAccountDetail />;
}


// import { useEffect, useState } from 'react';
// import { useParams, Link } from 'react-router-dom';
// import { FilterBar } from '../components/FilterBar';
// import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
// import { api, ApiError } from '../lib/api';
// import { AwsAccountDetail } from './AwsAccountDetail';
// import { GcpProjectDetail } from './GcpProjectDetail';
// import { AzureAccountDetail } from './AzureAccountDetail';

// /**
//  * One route (`/cloud-accounts/:id`) for all three providers — the merged
//  * Inventory table (CloudAccounts.tsx) no longer tells you up front which
//  * kind of row you clicked, and account IDs are unique across the whole
//  * cloud_connections table regardless of provider, so this probes AWS first
//  * (the far more common case), then GCP, then Azure on successive 404s
//  * rather than needing a ?provider= query param or a second URL segment.
//  *
//  * Delegates to the existing AwsAccountDetail/GcpProjectDetail/
//  * AzureAccountDetail components unchanged rather than merging their
//  * combined lines of provider-specific tabs (Cost, CUR, Permissions,
//  * Sync History, Recommendations — most of which gcp-accounts-api and
//  * azure-accounts-api have no equivalent of yet) into one file. All three
//  * already read `id` via their own useParams, which still resolves
//  * correctly rendered as plain children here since no extra <Route> is
//  * introduced between this component and the router.
//  */
// export function CloudAccountDetail() {
//   const { id } = useParams<{ id: string }>();
//   const [provider, setProvider] = useState<'aws' | 'gcp' | 'azure' | null>(null);
//   const [notFound, setNotFound] = useState(false);

//   useEffect(() => {
//     if (!id) return;
//     let cancelled = false;
//     setProvider(null);
//     setNotFound(false);
//     (async () => {
//       try {
//         await api.getAccount(id);
//         if (!cancelled) setProvider('aws');
//       } catch (awsErr) {
//         if (awsErr instanceof ApiError && awsErr.status !== 404) {
//           if (!cancelled) setNotFound(true);
//           return;
//         }
//         try {
//           await api.getGcpAccount(id);
//           if (!cancelled) setProvider('gcp');
//         } catch (gcpErr) {
//           if (gcpErr instanceof ApiError && gcpErr.status !== 404) {
//             if (!cancelled) setNotFound(true);
//             return;
//           }
//           try {
//             await api.getAzureAccount(id);
//             if (!cancelled) setProvider('azure');
//           } catch {
//             if (!cancelled) setNotFound(true);
//           }
//         }
//       }
//     })();
//     return () => { cancelled = true; };
//   }, [id]);

//   if (notFound) {
//     return (
//       <div>
//         <FilterBar title="Account Not Found" breadcrumb={<Link to="/cloud-accounts" className="text-xs text-slate-400 hover:underline">← Cloud Accounts</Link>} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />
//         <p className="text-sm text-slate-400 py-10 text-center">This account or project doesn't exist, or you don't have access to it.</p>
//       </div>
//     );
//   }

//   if (!provider) {
//     return (
//       <div className="flex flex-col gap-5">
//         <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
//         <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
//       </div>
//     );
//   }

//   if (provider === 'gcp') return <GcpProjectDetail />;
//   if (provider === 'azure') return <AzureAccountDetail />;
//   return <AwsAccountDetail />;
// }
