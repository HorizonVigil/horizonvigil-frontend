/**
 * FinOps — one module over three sections (spec §2: "do NOT create two
 * separate top-level menus"): Overview, Cost Management, Cost Optimization.
 * Cost Management and Cost Optimization keep their existing, working
 * implementations verbatim (CostManagementBody / CostOptimizationBody —
 * same files, just no longer render their own FilterBar); this shell owns
 * one shared FilterBar and the section switch above their own `?tab=`.
 *
 * It also owns the Cloud + Environment "group filter" (spec's global filter
 * system) — one pair of dropdowns here applies to whichever section is
 * active, rather than Overview having its own private copy. See
 * lib/finops/groupFilter.ts for why some endpoints can only honor this via
 * client-side row filtering rather than a request parameter.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { useFilters } from '../lib/filterContext';
import { api } from '../lib/api';
import { CostManagementBody } from './CostManagement';
import { CostOptimizationBody } from './CostOptimization';
import { FinOpsOverviewTab } from '../components/finops/FinOpsOverviewTab';
import { PROVIDER_LABEL } from '../lib/finops/overview';
import { groupConnectionIds, type Provider, type ResolvedGroupFilter } from '../lib/finops/groupFilter';
import { SUPPORTED_CURRENCIES, CURRENCY_LABEL, type Currency } from '../lib/finops/fx';

const CURRENCY_STORAGE_KEY = 'horizonvigil_finops_display_currency';

function getInitialCurrency(): Currency {
  try {
    const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if ((SUPPORTED_CURRENCIES as readonly string[]).includes(stored ?? '')) return stored as Currency;
  } catch {
    // localStorage unavailable (private browsing, blocked site data) — fall through to the default
  }
  return 'USD';
}

const SECTIONS = ['Overview', 'Cost Management', 'Cost Optimization'] as const;
type Section = typeof SECTIONS[number];

/** FinOps' three sections are visible if the user can see ANY child grouped under them — Overview has no sidebar entry of its own (default landing), same convention as Cost Optimization's old Overview tab. */
function useSectionAccess() {
  const canSeeChild = useSubmenuAccess('cost');
  const costManagementLabels = ['Cost Explorer', 'Cost Analytics', 'Forecast', 'Budgets', 'Cost Allocation', 'Chargeback', 'Showback', 'Cost Reports'];
  const costOptimizationLabels = ['Savings Opportunities', 'Rightsizing', 'Idle Resources', 'Reserved Instances', 'Savings Plans', 'Cost Anomalies', 'Optimization History'];
  return (section: Section): boolean => {
    if (section === 'Overview') return true;
    const labels = section === 'Cost Management' ? costManagementLabels : costOptimizationLabels;
    return labels.some(canSeeChild);
  };
}

export function FinOps() {
  const [searchParams, setSearchParams] = useSearchParams();
  const canSeeSection = useSectionAccess();
  const { connections } = useFilters();
  const fromUrl = searchParams.get('section');
  const section: Section = fromUrl && (SECTIONS as readonly string[]).includes(fromUrl) ? (fromUrl as Section) : 'Overview';
  const visibleSections = SECTIONS.filter(canSeeSection);

  const [provider, setProvider] = useState<Provider | null>(null);
  const [environment, setEnvironment] = useState<string>('all');
  const providers = useMemo(() => [...new Set(connections.map((c) => c.provider))].sort() as Provider[], [connections]);
  const environments = useMemo(() => [...new Set(connections.map((c) => c.environment))].sort(), [connections]);
  const groupFilter = useMemo<ResolvedGroupFilter>(
    () => ({ provider, environment, connectionIds: groupConnectionIds({ provider, environment }, connections) }),
    [provider, environment, connections],
  );

  // Display currency — Overview's KPI strip only (see FinOpsOverviewTab.tsx
  // and lib/finops/fx.ts); Cost Management/Optimization stay USD, so the
  // selector itself is only shown while Overview is the active section
  // rather than implying a control that silently does nothing elsewhere.
  const [currency, setCurrency] = useState<Currency>(getInitialCurrency);
  useEffect(() => {
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    } catch {
      // best-effort — a missed save just means it doesn't persist across visits
    }
  }, [currency]);
  const fxQuery = useQuery({ queryKey: ['finops', 'fx-rates'], queryFn: () => api.getFxRates(), staleTime: 6 * 60 * 60 * 1000 });

  function setSection(next: Section) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'Overview') params.delete('section');
      else params.set('section', next);
      params.delete('tab'); // each section owns its own default tab
      return params;
    });
  }

  return (
    <div>
      {/* Cost Optimization's endpoints don't take a date-range or region param (each recommendation category is its own "currently open" list) — same conditional hide the standalone page used. */}
      <FilterBar title="FinOps" subtitle="Multi-cloud cost management & optimization" breadcrumb={<Breadcrumb />} showRegionFilter={section !== 'Cost Optimization'} showDateFilter={section !== 'Cost Optimization'} />

      {(providers.length > 1 || environments.length > 1 || section === 'Overview') && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {section === 'Overview' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Currency</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className={`text-sm rounded-md border bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2 py-1.5 ${currency !== 'USD' ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}
              >
                {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
              </select>
            </div>
          )}
          {providers.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Cloud</span>
              <select
                value={provider ?? 'all'}
                onChange={(e) => setProvider(e.target.value === 'all' ? null : (e.target.value as Provider))}
                className={`text-sm rounded-md border bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2 py-1.5 ${provider ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <option value="all">All clouds</option>
                {providers.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
              </select>
            </div>
          )}
          {environments.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Environment</span>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className={`text-sm rounded-md border bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2 py-1.5 ${environment !== 'all' ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <option value="all">All environments</option>
                {environments.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {visibleSections.map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => setSection(s)}
            role="tab"
            aria-selected={section === s}
            className={`text-sm font-medium px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${section === s ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {section === 'Overview' && <FinOpsOverviewTab groupFilter={groupFilter} onProviderChange={setProvider} currency={currency} fxRates={fxQuery.data?.rates} fxDate={fxQuery.data?.date} />}
      {section === 'Cost Management' && <CostManagementBody groupFilter={groupFilter} />}
      {section === 'Cost Optimization' && <CostOptimizationBody groupFilter={groupFilter} />}
    </div>
  );
}
