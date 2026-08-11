import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFilters } from './filterContext';

/**
 * Two-way syncs the global region/account filters to the current page's
 * ?region=/?account= query params, scoped to the Resources section (the
 * global FilterBar context itself stays page-local everywhere else in the
 * app -- this doesn't change that, it just mirrors it into the URL on the
 * pages that call it).
 *
 * Reads once on arrival, so a bookmarked or shared filtered link restores
 * the filter instead of silently landing on "All Accounts" / "All Regions".
 * Writes on every change after that, so the current view stays
 * bookmarkable/shareable as the user adjusts filters -- including right
 * after navigating to a fresh Resources page whose own link didn't happen
 * to carry the query string forward itself.
 */
export function useResourcesUrlFilters() {
  const { region, account, setRegion, setAccount } = useFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedFromUrl = useRef(false);

  useEffect(() => {
    if (appliedFromUrl.current) return;
    appliedFromUrl.current = true;
    const urlRegion = searchParams.get('region');
    const urlAccount = searchParams.get('account');
    if (urlRegion) setRegion(urlRegion);
    if (urlAccount) setAccount(urlAccount);
  }, [searchParams, setRegion, setAccount]);

  useEffect(() => {
    if (!appliedFromUrl.current) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (region === 'all') next.delete('region');
      else next.set('region', region);
      if (account === 'all') next.delete('account');
      else next.set('account', account);
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, account]);
}
