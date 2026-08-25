import { useMemo, useState } from 'react';
import type { CloudResource } from './api';

/**
 * The Resources tab's search/category/region/status filtering, shared
 * across AwsAccountDetail.tsx/AzureAccountDetail.tsx/GcpProjectDetail.tsx --
 * was three copies of the identical four useMemo derivations and filter
 * predicate, drifting risk-free only because none of the three had diverged
 * yet. Must be called unconditionally before any early return in the
 * calling component (same Rules-of-Hooks reasoning as the useMemo calls it
 * replaces -- see AwsAccountDetail.tsx's own comment on the bug that caused).
 */
export function useResourceFilters(resources: CloudResource[]) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState('');

  const categories = useMemo(() => Array.from(new Set(resources.map(r => r.category))).sort(), [resources]);
  const regions = useMemo(() => Array.from(new Set(resources.map(r => r.region).filter((r): r is string => !!r))).sort(), [resources]);
  const statuses = useMemo(() => Array.from(new Set(resources.map(r => r.status))).sort(), [resources]);

  const filtered = useMemo(() => resources.filter(r => {
    if (category && r.category !== category) return false;
    if (region && r.region !== region) return false;
    if (status && r.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(r.resource_name ?? r.resource_id).toLowerCase().includes(q) && !r.resource_type_key.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [resources, category, region, status, search]);

  const hasActiveFilters = !!(search || category || region || status);
  function clearFilters() { setSearch(''); setCategory(''); setRegion(''); setStatus(''); }

  return { search, setSearch, category, setCategory, region, setRegion, status, setStatus, categories, regions, statuses, filtered, hasActiveFilters, clearFilters };
}

export type ResourceFilters = ReturnType<typeof useResourceFilters>;
