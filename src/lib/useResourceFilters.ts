import { useCallback, useMemo, useState } from 'react';
import type { CloudResource } from './api';

/**
 * Shared Resources-tab filtering for:
 * - AwsAccountDetail.tsx
 * - AzureAccountDetail.tsx
 * - GcpProjectDetail.tsx
 *
 * The hook centralizes search/category/region/status state and derivation so
 * the three detail surfaces cannot silently drift in their filtering rules.
 *
 * IMPORTANT:
 * Call this hook unconditionally before any early return in the consuming
 * component. This is required by React's Rules of Hooks.
 */

export interface ResourceFiltersResult {
  readonly search: string;
  readonly setSearch: (value: string) => void;
  readonly category: string;
  readonly setCategory: (value: string) => void;
  readonly region: string;
  readonly setRegion: (value: string) => void;
  readonly status: string;
  readonly setStatus: (value: string) => void;
  readonly categories: string[];
  readonly regions: string[];
  readonly statuses: string[];
  readonly filtered: CloudResource[];
  readonly hasActiveFilters: boolean;
  readonly clearFilters: () => void;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function normalizeFilterValue(value: string): string {
  return value.trim();
}

function resourceSearchText(resource: CloudResource): string {
  return [
    resource.resource_name,
    resource.resource_id,
    resource.resource_type_key,
    resource.category,
    resource.region,
    resource.status,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLocaleLowerCase();
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

export function useResourceFilters(
  resources: CloudResource[],
): ResourceFiltersResult {
  const [search, setSearchState] = useState('');
  const [category, setCategoryState] = useState('');
  const [region, setRegionState] = useState('');
  const [status, setStatusState] = useState('');

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
  }, []);

  const setCategory = useCallback((value: string) => {
    setCategoryState(value);
  }, []);

  const setRegion = useCallback((value: string) => {
    setRegionState(value);
  }, []);

  const setStatus = useCallback((value: string) => {
    setStatusState(value);
  }, []);

  const normalizedSearch = useMemo(
    () => normalizeSearch(search),
    [search],
  );

  const normalizedCategory = useMemo(
    () => normalizeFilterValue(category),
    [category],
  );

  const normalizedRegion = useMemo(
    () => normalizeFilterValue(region),
    [region],
  );

  const normalizedStatus = useMemo(
    () => normalizeFilterValue(status),
    [status],
  );

  const categories = useMemo(
    () => uniqueSorted(resources.map(resource => resource.category)),
    [resources],
  );

  const regions = useMemo(
    () => uniqueSorted(resources.map(resource => resource.region)),
    [resources],
  );

  const statuses = useMemo(
    () => uniqueSorted(resources.map(resource => resource.status)),
    [resources],
  );

  const filtered = useMemo(() => {
    if (resources.length === 0) return [];

    return resources.filter(resource => {
      if (normalizedCategory && resource.category !== normalizedCategory) {
        return false;
      }

      if (normalizedRegion && resource.region !== normalizedRegion) {
        return false;
      }

      if (normalizedStatus && resource.status !== normalizedStatus) {
        return false;
      }

      if (normalizedSearch) {
        return resourceSearchText(resource).includes(normalizedSearch);
      }

      return true;
    });
  }, [
    resources,
    normalizedCategory,
    normalizedRegion,
    normalizedStatus,
    normalizedSearch,
  ]);

  const hasActiveFilters =
    normalizedSearch.length > 0 ||
    normalizedCategory.length > 0 ||
    normalizedRegion.length > 0 ||
    normalizedStatus.length > 0;

  const clearFilters = useCallback(() => {
    setSearchState('');
    setCategoryState('');
    setRegionState('');
    setStatusState('');
  }, []);

  return {
    search,
    setSearch,
    category,
    setCategory,
    region,
    setRegion,
    status,
    setStatus,
    categories,
    regions,
    statuses,
    filtered,
    hasActiveFilters,
    clearFilters,
  };
}

export type ResourceFilters = ReturnType<typeof useResourceFilters>;
