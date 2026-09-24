import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFilters } from './filterContext';

/**
 * Synchronizes the global Resources filters with the page URL:
 *
 *   ?region=<region>&account=<account>
 *
 * URL state is restored once when this hook is mounted, then filter changes
 * are reflected back into the URL using history replacement so filtering does
 * not create a browser-history entry for every click.
 *
 * The hook intentionally only owns the Resources page's URL representation.
 * It does not change the global FilterBar's broader page-local behavior.
 */
export function useResourcesUrlFilters(): void {
  const { region, account, setRegion, setAccount } = useFilters();
  const [searchParams, setSearchParams] = useSearchParams();

  const appliedFromUrl = useRef(false);
  const writeGeneration = useRef(0);

  useEffect(() => {
    if (appliedFromUrl.current) return;

    appliedFromUrl.current = true;

    const urlRegion = searchParams.get('region');
    const urlAccount = searchParams.get('account');

    if (urlRegion) {
      setRegion(urlRegion);
    }

    if (urlAccount) {
      setAccount(urlAccount);
    }
  }, [searchParams, setRegion, setAccount]);

  useEffect(() => {
    if (!appliedFromUrl.current) return;

    const generation = ++writeGeneration.current;

    setSearchParams(
      previous => {
        // If another effect cycle has superseded this update, avoid applying
        // stale URL state.
        if (generation !== writeGeneration.current) {
          return previous;
        }

        const next = new URLSearchParams(previous);

        setOrDeleteFilter(next, 'region', region);
        setOrDeleteFilter(next, 'account', account);

        return next;
      },
      { replace: true },
    );
  }, [region, account, setSearchParams]);
}

function setOrDeleteFilter(
  params: URLSearchParams,
  key: 'region' | 'account',
  value: string,
): void {
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (!normalized || normalized === 'all') {
    params.delete(key);
    return;
  }

  params.set(key, normalized);
}
