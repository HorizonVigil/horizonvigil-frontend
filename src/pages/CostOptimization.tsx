import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { Modal } from '../components/Modal';
import { LineChart } from '../components/charts/LineChart';
import { useFilters } from '../lib/filterContext';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { useToast } from '../lib/toast';
import { useConfirm } from '../components/ConfirmDialog';
import { api, ApiError, type CostRecommendation, type RecommendationListParams, type CostAnomaly, type CloudResource, type ResourceMetric, type RemediationRequest, type ExclusionReason, type ExclusionDuration, type Member, type GitInstallation, type GitRepo } from '../lib/api';
import { money as formatMoney } from '../lib/format';
import { filterByGroup, type ResolvedGroupFilter } from '../lib/finops/groupFilter';
import { PROVIDER_LABEL } from '../lib/finops/overview';

const EXCLUSION_REASONS: { value: ExclusionReason; label: string }[] = [
  { value: 'business_critical', label: 'Business Critical' },
  { value: 'performance_required', label: 'Performance Required' },
  { value: 'temporary_workload', label: 'Temporary Workload' },
  { value: 'false_positive', label: 'False Positive' },
  { value: 'other', label: 'Other' },
];
const EXCLUSION_DURATIONS: { value: ExclusionDuration; label: string }[] = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'permanent', label: 'Permanent' },
  { value: 'custom', label: 'Custom date' },
];

/** cost-optimization-api's rightsizing text always has this exact shape (see generateRecommendations.ts's rightsizing issue text) — parsed back out here rather than duplicated as structured columns, since the string is the one source of truth for it and this codebase already leans on that pattern (e.g. Alerts' connectionName lookup) rather than a schema change for a single derived display value. */
function parseRecommendedType(recommendedAction: string): string | null {
  return /Downsize to (\S+)/.exec(recommendedAction)?.[1] ?? null;
}

// This page's recommendations often deal in small dollar amounts (e.g. an
// unassociated EIP at $3.65/mo) where the shared money()'s default
// whole-dollar rounding would round the number away entirely -- pinned to
// 2 decimal places here, same behavior as before, now delegating to the
// shared formatter instead of reimplementing it.
function money(n: number): string {
  return formatMoney(n, 2);
}

const TABS = ['Overview', 'Recommendations', 'Rightsizing', 'Idle Resources', 'Reserved Instances', 'Savings Plans', 'Cost Anomalies', 'History'] as const;
type Tab = typeof TABS[number];

// This page's tab values diverge from navConfig.ts's sidebar labels for the
// same items ("Recommendations" here is "Savings Opportunities" there,
// "History" here is "Optimization History" there) -- useSubmenuAccess keys
// off the navConfig label, so the two have to be bridged by hand. "Overview"
// has no sidebar entry of its own (it's the default landing tab, not listed
// separately) and is left unmapped, which resolves to visible-to-all, same
// as an unrestricted sidebar item would.
const TAB_TO_NAV_LABEL: Partial<Record<Tab, string>> = {
  Recommendations: 'Savings Opportunities', Rightsizing: 'Rightsizing', 'Idle Resources': 'Idle Resources',
  'Reserved Instances': 'Reserved Instances', 'Savings Plans': 'Savings Plans', 'Cost Anomalies': 'Cost Anomalies',
  History: 'Optimization History',
};

/** Cost Optimization section of FinOps — unchanged from when this was its own top-level page, minus its own FilterBar (FinOps.tsx renders one shared bar for all three sections now). Still keyed on navConfig icon 'cost' (FinOps' single merged icon) for RBAC lookups. */
export function CostOptimizationBody({ groupFilter }: { groupFilter: ResolvedGroupFilter }) {
  const { account, refreshToken } = useFilters();
  const { toast } = useToast();
  // Every one of this page's endpoints only accepts a single connectionId,
  // not a list -- so the Cloud/Environment group filter can't be sent as a
  // request param the way the single-account FilterBar selection is. Instead,
  // when Account is "all" and the group filter is active, rows are fetched
  // unscoped and narrowed client-side by their own connection_id.
  const groupIds = account === 'all' ? groupFilter.connectionIds : undefined;
  const groupFilterActive = Boolean(groupFilter.provider || groupFilter.environment !== 'all');
  const { confirm, dialog: confirmDialog } = useConfirm();
  const canSeeNavTab = useSubmenuAccess('cost');
  const canSeeTab = useCallback((t: Tab) => canSeeNavTab(TAB_TO_NAV_LABEL[t] ?? t), [canSeeNavTab]);
  const visibleTabs = TABS.filter(canSeeTab);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof api.getCostOptimizationDashboard>> | null>(null);
  // The general open savings-opportunities feed — powers the Recommendations
  // tab and (since there's no single "everything" endpoint anymore) the
  // top stat cards' High Priority count.
  const [savingsOpportunities, setSavingsOpportunities] = useState<CostRecommendation[]>([]);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);
  const [tabRows, setTabRows] = useState<CostRecommendation[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [selected, setSelected] = useState<CostRecommendation | null>(null);
  const [copied, setCopied] = useState(false);
  const [anomalies, setAnomalies] = useState<CostAnomaly[]>([]);
  // Populated only for a rightsizing recommendation — the resource's own
  // record (for its current instanceType/region/AWS id) plus its collected
  // CPU history, both real data already gathered by aws-accounts-api's
  // ec2Metrics.ts scanner, not fetched fresh here.
  const [selectedResource, setSelectedResource] = useState<CloudResource | null>(null);
  const [selectedCpuHistory, setSelectedCpuHistory] = useState<ResourceMetric[]>([]);
  const [selectedDetailLoading, setSelectedDetailLoading] = useState(false);
  // The most recent resize_instance remediation request (if any) already
  // filed for this resource — lets the drawer show "Resize requested",
  // "Awaiting approval", etc. instead of offering a duplicate request.
  const [resizeRequest, setResizeRequest] = useState<RemediationRequest | null>(null);
  const [resizeRequesting, setResizeRequesting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);
  const [anomalyError, setAnomalyError] = useState<string | null>(null);
  const [mutationId, setMutationId] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const tabRequestRef = useRef(0);
  const anomalyRequestRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selected || selected.category !== 'rightsizing' || !selected.resource_id) {
      setSelectedResource(null);
      setSelectedCpuHistory([]);
      setResizeRequest(null);
      return;
    }

    let cancelled = false;
    setSelectedDetailLoading(true);

    void Promise.all([
      api.getResource(selected.resource_id),
      api.getMetrics({
        resourceId: selected.resource_id,
        metricName: 'CPUUtilization',
        limit: 60,
      }),
      api.listRemediation({ connectionId: selected.connection_id }),
    ])
      .then(([resource, metrics, remediation]) => {
        if (cancelled) return;

        setSelectedResource(resource);
        setSelectedCpuHistory(
          [...metrics.items].sort((a, b) => a.ts.localeCompare(b.ts)),
        );
        setResizeRequest(
          remediation.items.find(
            r =>
              r.resource_id === selected.resource_id &&
              r.action_type === 'resize_instance',
          ) ?? null,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedResource(null);
        setSelectedCpuHistory([]);
        setResizeRequest(null);
      })
      .finally(() => {
        if (!cancelled) setSelectedDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);


  // resize_instance's execute step can only ever safely issue StopInstances
  // and stop there — AWS's stop is itself asynchronous, so a Worker
  // invocation can't block waiting for it. Once a request lands in
  // 'awaiting_stop', this polls finish-resize every few seconds (same "small
  // step, caller drives the loop" shape as the sync/discovery polling
  // elsewhere in this app) until the instance is confirmed stopped and the
  // resize completes.
  // Keyed on id+status (not the resizeRequest object itself) so the interval
  // isn't torn down and rebuilt on every poll tick — setResizeRequest(updated)
  // below produces a new object each time even when status hasn't changed,
  // which would otherwise clear and never recreate the interval.
  const resizeRequestId = resizeRequest?.id;
  const resizeRequestStatus = resizeRequest?.status;
  useEffect(() => {
    if (!resizeRequestId || resizeRequestStatus !== 'awaiting_stop') return;

    const interval = setInterval(() => {
      void api
        .finishResizeRemediation(resizeRequestId)
        .then(updated => setResizeRequest(updated))
        .catch(() => {
          // Keep the current state. The next poll can recover from a transient
          // API failure without interrupting the remediation workflow.
        });
    }, 8000);
    return () => clearInterval(interval);
  }, [resizeRequestId, resizeRequestStatus]);

  async function requestAutomatedResize(recommendation: CostRecommendation, targetInstanceType: string) {
    if (!recommendation.resource_id) return;
    const ok = await confirm(
      `Request an automated resize to "${targetInstanceType}"? This goes through an approval + dry-run before anything actually runs against AWS. Once executed, the instance will stop, resize, and restart — there will be real downtime for that duration.`,
    );
    if (!ok) return;
    setResizeRequesting(true);
    try {
      const created = await api.requestRemediation({
        connectionId: recommendation.connection_id, resourceId: recommendation.resource_id, actionType: 'resize_instance',
        recommendationId: recommendation.id, targetConfig: { targetInstanceType },
      });
      setResizeRequest(created);
      toast('Resize requested — an admin needs to approve it in Automation → Remediation before it runs.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not request automated resize', 'error');
    } finally {
      setResizeRequesting(false);
    }
  }

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoadError(null);

    try {
      const connectionId = account === 'all' ? undefined : account;

      const [dash, opportunities] = await Promise.all([
        api.getCostOptimizationDashboard(),
        api.getSavingsOpportunities({
          connectionId,
          status: 'open',
          limit: 200,
        }),
      ]);

      if (requestId !== loadRequestRef.current) return;

      setDashboard(dash);
      setSavingsOpportunities(filterByGroup(opportunities.items, groupIds));
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;

      setLoadError(
        err instanceof Error
          ? err.message
          : 'Could not load cost optimization data.',
      );
    }
  }, [account, groupIds]);


  useEffect(() => { void load(); }, [load, refreshToken]);

  // Each category now lives behind its own dedicated cost-optimization-api
  // route (getRightsizing, getIdleResources, getReservedInstances,
  // getSavingsPlans, getOptimizationHistory) instead of one list filtered
  // client-side by `category` — so tab switches fetch fresh.
  useEffect(() => {
    if (
      tab === 'Overview' ||
      tab === 'Recommendations' ||
      tab === 'Cost Anomalies'
    ) {
      setTabRows([]);
      setTabError(null);
      return;
    }

    const requestId = ++tabRequestRef.current;
    let cancelled = false;

    setTabLoading(true);
    setTabError(null);

    const connectionId = account === 'all' ? undefined : account;
    const params: RecommendationListParams = {
      connectionId,
      limit: 200,
    };

    const call =
      tab === 'Rightsizing'
        ? api.getRightsizing({ ...params, status: 'open' })
        : tab === 'Idle Resources'
          ? api.getIdleResources({ ...params, status: 'open' })
          : tab === 'Reserved Instances'
            ? api.getReservedInstances({ ...params, status: 'open' })
            : tab === 'Savings Plans'
              ? api.getSavingsPlans({ ...params, status: 'open' })
              : api.getOptimizationHistory(params);

    void call
      .then(res => {
        if (cancelled || requestId !== tabRequestRef.current) return;
        setTabRows(filterByGroup(res.items, groupIds));
      })
      .catch(err => {
        if (cancelled || requestId !== tabRequestRef.current) return;
        setTabRows([]);
        setTabError(
          err instanceof Error
            ? err.message
            : 'Could not load optimization recommendations.',
        );
      })
      .finally(() => {
        if (!cancelled && requestId === tabRequestRef.current) {
          setTabLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tab, account, refreshToken, groupIds]);


  useEffect(() => {
    if (tab !== 'Cost Anomalies') return;

    const requestId = ++anomalyRequestRef.current;
    let cancelled = false;

    setAnomalyError(null);

    const connectionId = account === 'all' ? undefined : account;

    void api
      .getCostAnomalies({ connectionId, limit: 200 })
      .then(res => {
        if (cancelled || requestId !== anomalyRequestRef.current) return;
        setAnomalies(filterByGroup(res.items, groupIds));
      })
      .catch(err => {
        if (cancelled || requestId !== anomalyRequestRef.current) return;
        setAnomalies([]);
        setAnomalyError(
          err instanceof Error
            ? err.message
            : 'Could not load cost anomalies.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [tab, account, refreshToken, groupIds]);


  async function handleAnomalyStatus(
    id: string,
    status: 'acknowledged' | 'resolved',
  ) {
    if (mutationId) return;

    setMutationId(id);
    setAnomalyError(null);

    try {
      await api.updateCostAnomaly(id, status);

      const connectionId = account === 'all' ? undefined : account;
      const res = await api.getCostAnomalies({
        connectionId,
        limit: 200,
      });

      setAnomalies(filterByGroup(res.items, groupIds));
    } catch (err) {
      setAnomalyError(
        err instanceof Error
          ? err.message
          : 'Could not update the anomaly.',
      );
    } finally {
      setMutationId(null);
    }
  }


  // dashboard.totalPotentialMonthlySavings/openRecommendations come from a
  // whole-org endpoint with no connectionId/group param at all -- so they
  // can't respect the Account or Cloud/Environment filter. savingsOpportunities
  // is already fetched scoped by both (server-side connectionId, then
  // client-side group filtering above), so these three are derived from it
  // instead -- real numbers that actually track the active filters, rather
  // than an org-wide total silently ignoring them.
  const potentialMonthly = useMemo(() => savingsOpportunities.reduce((s, r) => s + r.potential_monthly_savings, 0), [savingsOpportunities]);
  const potentialAnnual = potentialMonthly * 12;
  const openRecommendationsCount = savingsOpportunities.length;

  async function markDone(
    id: string,
    status: 'applied' | 'dismissed',
  ) {
    if (mutationId) return;

    setMutationId(id);

    try {
      await api.updateSavingsOpportunity(id, status);
      setSelected(null);
      await refreshLists();
    } catch (err) {
      toast(
        err instanceof ApiError
          ? err.message
          : 'Could not update this recommendation.',
        'error',
      );
    } finally {
      setMutationId(null);
    }
  }


  async function copyText(value: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }

      setCopied(true);

      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }

      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 1500);
    } catch {
      toast('Could not copy to clipboard.', 'error');
    }
  }

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);


  async function refreshLists() {
    await load();
    if (tab !== 'Overview' && tab !== 'Recommendations') {
      const connectionId = account === 'all' ? undefined : account;
      const params: RecommendationListParams = { connectionId, limit: 200 };
      const call =
        tab === 'Rightsizing' ? api.getRightsizing({ ...params, status: 'open' }) :
        tab === 'Idle Resources' ? api.getIdleResources({ ...params, status: 'open' }) :
        tab === 'Reserved Instances' ? api.getReservedInstances({ ...params, status: 'open' }) :
        tab === 'Savings Plans' ? api.getSavingsPlans({ ...params, status: 'open' }) :
        api.getOptimizationHistory(params);
      const res = await call;
      setTabRows(filterByGroup(res.items, groupIds));
    }
  }

  const [excludeTarget, setExcludeTarget] = useState<CostRecommendation | null>(null);
  const [excludeReason, setExcludeReason] = useState<ExclusionReason>('business_critical');
  const [excludeJustification, setExcludeJustification] = useState('');
  const [excludeDuration, setExcludeDuration] = useState<ExclusionDuration>('30d');
  const [excludeUntil, setExcludeUntil] = useState('');
  const [excludeSubmitting, setExcludeSubmitting] = useState(false);

  function openExcludeModal(r: CostRecommendation) {
    setExcludeReason('business_critical');
    setExcludeJustification('');
    setExcludeDuration('30d');
    setExcludeUntil('');
    setExcludeTarget(r);
  }

  async function submitExclude() {
    if (!excludeTarget) return;
    if (excludeDuration === 'custom' && !excludeUntil) {
      toast('Pick a date for a custom exclusion.', 'error');
      return;
    }

    if (excludeDuration === 'custom') {
      const until = new Date(`${excludeUntil}T23:59:59.999Z`);
      if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
        toast('The custom exclusion date must be in the future.', 'error');
        return;
      }
    }

    const justification = excludeJustification.trim();
    if (justification.length > 2000) {
      toast('Justification must be 2,000 characters or fewer.', 'error');
      return;
    }
    setExcludeSubmitting(true);
    try {
      await api.excludeSavingsOpportunity(excludeTarget.id, {
        reason: excludeReason, justification: excludeJustification || undefined, duration: excludeDuration,
        until: excludeDuration === 'custom' ? new Date(excludeUntil).toISOString() : undefined,
      });
      toast('Recommendation excluded — it will stop appearing in open views until the exclusion lapses (or is reversed).', 'success');
      setExcludeTarget(null);
      if (selected?.id === excludeTarget.id) setSelected(null);
      await refreshLists();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not exclude this recommendation', 'error');
    } finally {
      setExcludeSubmitting(false);
    }
  }

  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => { void api.getMembers().then(res => setMembers(res.members)).catch(() => {}); }, []);

  const [gitInstallations, setGitInstallations] = useState<GitInstallation[]>([]);
  useEffect(() => { void api.getGitInstallations().then(res => setGitInstallations(res.items)).catch(() => {}); }, []);

  const [notifyTarget, setNotifyTarget] = useState<CostRecommendation | null>(null);
  const [notifyRecipientUserId, setNotifyRecipientUserId] = useState('');
  const [notifyAdditionalEmails, setNotifyAdditionalEmails] = useState('');
  const [notifySubmitting, setNotifySubmitting] = useState(false);

  function openNotifyModal(r: CostRecommendation) {
    setNotifyRecipientUserId(r.assigned_to ?? '');
    setNotifyAdditionalEmails('');
    setNotifyTarget(r);
  }

  async function submitNotify() {
    if (!notifyTarget) return;
    const additionalEmails = notifyAdditionalEmails
      .split(',')
      .map(e => e.trim())
      .filter(Boolean);

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (additionalEmails.some(email => !emailPattern.test(email))) {
      toast('One or more additional email addresses are invalid.', 'error');
      return;
    }

    if (additionalEmails.length > 20) {
      toast('You can add at most 20 additional email addresses.', 'error');
      return;
    }

    if (!notifyRecipientUserId && additionalEmails.length === 0) {
      toast('Pick an assignee or enter at least one email address.', 'error');
      return;
    }
    setNotifySubmitting(true);
    try {
      const result = await api.notifyOwner(notifyTarget.id, { recipientUserId: notifyRecipientUserId || undefined, additionalEmails });
      toast(result.emailSent ? 'Owner notified — email sent.' : `Assignment saved, but the email wasn't sent: ${result.emailError}`, result.emailSent ? 'success' : 'error');
      setNotifyTarget(null);
      await refreshLists();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not notify the owner', 'error');
    } finally {
      setNotifySubmitting(false);
    }
  }

  const displayedRows = useMemo(
    () => (tab === 'Recommendations' ? savingsOpportunities : tabRows),
    [tab, savingsOpportunities, tabRows],
  );

  const highPriorityCount = useMemo(
    () => savingsOpportunities.filter(r => r.priority === 'high').length,
    [savingsOpportunities],
  );

  const baseColumns: Column<CostRecommendation>[] = [
    { key: 'resource', header: 'Resource', render: r => r.resource_id ?? '—', sortValue: r => r.resource_id ?? '' },
    { key: 'issue', header: 'Issue', render: r => r.issue, sortValue: r => r.issue },
    { key: 'action', header: 'Recommended Action', render: r => r.recommended_action, sortValue: r => r.recommended_action },
    { key: 'savings', header: '$/mo Savings', render: r => money(r.potential_monthly_savings), sortValue: r => r.potential_monthly_savings },
    { key: 'priority', header: 'Priority', render: r => <Badge tone={r.priority === 'high' ? 'critical' : r.priority === 'medium' ? 'warning' : 'good'}>{r.priority}</Badge>, sortValue: r => r.priority },
  ];
  const actionsColumn: Column<CostRecommendation> = {
    key: 'actions', header: 'Actions', render: r => (
      <div className="flex gap-2 text-xs">
        <button type="button" onClick={e => { e.stopPropagation(); setSelected(r); }} className="text-emerald-600 dark:text-emerald-400 hover:underline">Apply</button>
        <button type="button" onClick={e => { e.stopPropagation(); openNotifyModal(r); }} className="text-brand-600 dark:text-brand-400 hover:underline">Notify Owner</button>
        <button type="button" onClick={e => { e.stopPropagation(); openExcludeModal(r); }} className="text-amber-600 dark:text-amber-400 hover:underline">Exclude</button>
        <button type="button" onClick={e => { e.stopPropagation(); void markDone(r.id, 'dismissed'); }} disabled={mutationId === r.id} className="text-slate-400 hover:underline">Dismiss</button>
      </div>
    ),
  };
  const statusColumn: Column<CostRecommendation> = {
    key: 'status', header: 'Status', render: r => <Badge tone={r.status === 'applied' ? 'good' : 'neutral'}>{r.status}</Badge>, sortValue: r => r.status,
  };
  const columns: Column<CostRecommendation>[] = tab === 'History' ? [...baseColumns, statusColumn] : [...baseColumns, actionsColumn];

  const anomalyColumns: Column<CostAnomaly>[] = [
    { key: 'service', header: 'Service', render: a => a.service, sortValue: a => a.service },
    { key: 'usage_date', header: 'Date', render: a => a.usage_date, sortValue: a => a.usage_date },
    { key: 'expected_cost', header: 'Expected', render: a => money(a.expected_cost), sortValue: a => a.expected_cost },
    { key: 'actual_cost', header: 'Actual', render: a => money(a.actual_cost), sortValue: a => a.actual_cost },
    { key: 'percent_change', header: '% Change', render: a => <span className="text-amber-500 font-medium">+{a.percent_change.toFixed(0)}%</span>, sortValue: a => a.percent_change },
    { key: 'dollar_impact', header: '$ Impact', render: a => money(a.dollar_impact), sortValue: a => a.dollar_impact },
    { key: 'status', header: 'Status', render: a => <Badge>{a.status}</Badge>, sortValue: a => a.status },
    {
      key: 'actions', header: 'Actions', render: a => (
        <div className="flex gap-2 text-xs">
          {a.status === 'open' && <button type="button" onClick={e => { e.stopPropagation(); void handleAnomalyStatus(a.id, 'acknowledged'); }} disabled={mutationId === a.id} className="text-amber-600 dark:text-amber-400 hover:underline">Acknowledge</button>}
          {a.status !== 'resolved' && <button type="button" onClick={e => { e.stopPropagation(); void handleAnomalyStatus(a.id, 'resolved'); }} disabled={mutationId === a.id} className="text-emerald-600 dark:text-emerald-400 hover:underline">Resolve</button>}
        </div>
      ),
    },
  ];

  if (loadError && !dashboard) {
    return (
      <div className="flex flex-col gap-4">
        <div
          className="rounded-xl border border-red-200 dark:border-red-900
                     bg-red-50 dark:bg-red-900/20 p-6 text-center"
          role="alert"
        >
          <p className="text-sm text-red-600 dark:text-red-300">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {loadError && (
        <div
          className="mb-4 rounded-md border border-amber-200 dark:border-amber-900/60
                     bg-amber-50 dark:bg-amber-900/10 px-3 py-2 text-sm
                     text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3"
          role="alert"
        >
          <span>Cost optimization data could not be refreshed: {loadError}</span>
          <button type="button" onClick={() => void load()} className="shrink-0 text-xs underline">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Potential Monthly Savings" value={money(potentialMonthly)} />
        <StatCard label="Annualized Savings" value={money(potentialAnnual)} />
        <StatCard label="Open Opportunities" value={String(openRecommendationsCount)} />
        <StatCard label="High Priority" value={String(highPriorityCount)} />
      </div>

      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {visibleTabs.map(t => (
          <button
            type="button"
            key={t}
            onClick={() => setTab(t)}
            role="tab"
            aria-selected={tab === t}
            className={`text-sm px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            {TAB_TO_NAV_LABEL[t] ?? t}
          </button>
        ))}
      </div>

      {groupFilterActive && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
          Scoped to {groupFilter.provider ? PROVIDER_LABEL[groupFilter.provider] : 'all clouds'}{groupFilter.environment !== 'all' ? ` · ${groupFilter.environment}` : ''}.
        </p>
      )}

      {tab === 'Overview' ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400">
          <p>{openRecommendationsCount} open recommendation{openRecommendationsCount === 1 ? '' : 's'} across your connected AWS accounts, worth {money(potentialMonthly)}/month if fully applied.</p>
          <p className="mt-2">Recommendations are generated each time you run "Sync Now" on an AWS account — from your discovered resource inventory (idle instances, unattached volumes, unreleased IPs, stale snapshots), and from AWS Cost Explorer's own Reserved Instance and Savings Plan recommendation APIs. RI/Savings Plan recommendations only appear once an account has 30 days of steady enough on-demand usage for AWS to have something to recommend — a new or low-usage account legitimately shows none yet, which is expected, not a bug.</p>
          <p className="mt-2">HorizonVigil only ever requests read-only AWS permissions, so it can't make changes to your account itself. Clicking <span className="font-medium text-slate-700 dark:text-slate-200">Apply</span> on a recommendation shows you its details so you can action it yourself.</p>
          {dashboard && dashboard.openAnomalies > 0 && (
            <p className="mt-2">There {dashboard.openAnomalies === 1 ? 'is' : 'are'} also {dashboard.openAnomalies} open cost anomal{dashboard.openAnomalies === 1 ? 'y' : 'ies'} org-wide — see Cost Anomaly Detection below (this count itself isn't scoped by the Cloud/Environment filter; the list below is).</p>
          )}
        </div>
      ) : tab === 'Cost Anomalies' ? (
        <>
          {anomalyError && (
            <div className="mb-3 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300 flex items-center justify-between gap-3" role="alert">
              <span>{anomalyError}</span>
              <button type="button" onClick={() => setAnomalyError(null)} className="text-xs underline shrink-0">Dismiss</button>
            </div>
          )}
          <DataTable columns={anomalyColumns} rows={anomalies} rowKey={a => a.id} emptyMessage="No anomalies detected — day-over-day service cost spikes >50% will show up here." />
        </>
      ) : (
        <>
          {tabError && (
            <div className="mb-3 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300 flex items-center justify-between gap-3" role="alert">
              <span>{tabError}</span>
              <button type="button" onClick={() => setTabError(null)} className="text-xs underline shrink-0">Dismiss</button>
            </div>
          )}
          <DataTable columns={columns} rows={displayedRows} rowKey={r => r.id} emptyMessage={tab === 'History' ? 'No applied or dismissed recommendations yet.' : 'No recommendations in this category yet.'} />
          {tabLoading && <p className="text-xs text-slate-400 mt-2">Loading…</p>}
        </>
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.category === 'rightsizing' ? 'Rightsizing recommendation' : 'Apply recommendation'} wide={selected?.category === 'rightsizing'}>
        {selected && selected.category === 'rightsizing' ? (
          <RightsizingDetail
            recommendation={selected}
            resource={selectedResource}
            cpuHistory={selectedCpuHistory}
            loading={selectedDetailLoading}
            copied={copied}
            onCopy={copyText}
            onApply={() => void markDone(selected.id, 'applied')}
            onDismiss={() => void markDone(selected.id, 'dismissed')}
            onExclude={() => openExcludeModal(selected)}
            onNotifyOwner={() => openNotifyModal(selected)}
            resizeRequest={resizeRequest}
            resizeRequesting={resizeRequesting}
            onRequestResize={targetType => void requestAutomatedResize(selected, targetType)}
            gitInstallations={gitInstallations}
          />
        ) : selected && (
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Resource ID</div>
              <div className="text-slate-700 dark:text-slate-200 font-mono text-xs">{selected.resource_id ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Issue</div>
              <div className="text-slate-700 dark:text-slate-200">{selected.issue}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Recommended Action</div>
              <div className="rounded-lg bg-slate-900 dark:bg-black text-slate-100 text-xs p-3 whitespace-pre-wrap">{selected.recommended_action}</div>
              <button type="button" onClick={() => copyText(selected.recommended_action)} className="mt-2 text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                {copied ? 'Copied' : 'Copy recommended action'}
              </button>
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500">HorizonVigil only has read-only access to your AWS account and never makes this change for you — action it yourself in the AWS Console or CLI, then mark it done here.</p>

            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => void markDone(selected.id, 'applied')} className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">I've done this — mark as done</button>
              <button type="button" onClick={() => openNotifyModal(selected)} className="text-xs px-3 py-1.5 rounded-md border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950">Notify Owner</button>
              <button type="button" onClick={() => openExcludeModal(selected)} className="text-xs px-3 py-1.5 rounded-md border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950">Exclude</button>
              <button type="button" onClick={() => void markDone(selected.id, 'dismissed')} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Dismiss</button>
            </div>
          </div>
        )}
      </Drawer>

      <Modal open={!!excludeTarget} onClose={() => setExcludeTarget(null)} title="Exclude recommendation">
        {excludeTarget && (
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-xs text-slate-500 dark:text-slate-400">{excludeTarget.issue}</p>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Reason</label>
              <select value={excludeReason} onChange={e => setExcludeReason(e.target.value as ExclusionReason)} className="w-full text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5">
                {EXCLUSION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Justification (optional)</label>
              <textarea value={excludeJustification} onChange={e => setExcludeJustification(e.target.value)} rows={3} placeholder="Why should this be skipped?" className="w-full text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Duration</label>
              <select value={excludeDuration} onChange={e => setExcludeDuration(e.target.value as ExclusionDuration)} className="w-full text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5">
                {EXCLUSION_DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            {excludeDuration === 'custom' && (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Excluded until</label>
                <input type="date" value={excludeUntil} onChange={e => setExcludeUntil(e.target.value)} min={new Date().toISOString().slice(0, 10)} className="w-full text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5" />
              </div>
            )}
            <p className="text-xs text-slate-400">{excludeDuration === 'permanent' ? 'This recommendation will stay hidden from open views indefinitely, until manually reversed.' : 'This recommendation reappears automatically once the exclusion period ends.'}</p>
            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => void submitExclude()} disabled={excludeSubmitting} className="text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">{excludeSubmitting ? 'Excluding…' : 'Exclude'}</button>
              <button type="button" onClick={() => setExcludeTarget(null)} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!notifyTarget} onClose={() => setNotifyTarget(null)} title="Notify owner">
        {notifyTarget && (
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-xs text-slate-500 dark:text-slate-400">{notifyTarget.issue}</p>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Assign to (org member)</label>
              <select value={notifyRecipientUserId} onChange={e => setNotifyRecipientUserId(e.target.value)} className="w-full text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5">
                <option value="">— none —</option>
                {members.map(m => <option key={m.userId} value={m.userId}>{m.fullName ?? m.email ?? m.userId}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Additional emails (optional, comma-separated)</label>
              <input value={notifyAdditionalEmails} onChange={e => setNotifyAdditionalEmails(e.target.value)} placeholder="someone@example.com, another@example.com" className="w-full text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5" />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Email preview</div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p>A cost optimization recommendation in HorizonVigil has been assigned to you.</p>
                <p><strong>Issue:</strong> {notifyTarget.issue}</p>
                <p><strong>Recommended action:</strong> {notifyTarget.recommended_action}</p>
                <p><strong>Potential savings:</strong> {money(notifyTarget.potential_monthly_savings)}/month</p>
              </div>
            </div>
            {notifyTarget.last_notified_at && (
              <p className="text-xs text-slate-400">Last notified {new Date(notifyTarget.last_notified_at).toLocaleString()}.</p>
            )}
            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => void submitNotify()} disabled={notifySubmitting} className="text-xs px-3 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">{notifySubmitting ? 'Sending…' : 'Notify'}</button>
              <button type="button" onClick={() => setNotifyTarget(null)} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
      {confirmDialog}
    </div>
  );
}

/**
 * The rich per-recommendation view rightsizing gets instead of the generic
 * drawer — current vs. recommended instance size, real collected CPU
 * history (aws-accounts-api's ec2Metrics.ts scanner), and a real,
 * copy-pasteable AWS CLI guided fix (stop -> resize -> start, the only
 * correct order — AWS rejects ModifyInstanceAttribute's InstanceType
 * change on a running instance). Still manual, same "read-only access,
 * action it yourself" posture as the generic drawer — this composes real
 * commands from real data, it doesn't execute them.
 */
const RESIZE_STATUS_LABEL: Record<RemediationRequest['status'], string> = {
  pending_approval: 'Requested — awaiting admin approval', rejected: 'Request rejected', approved: 'Approved — awaiting dry-run',
  dry_run_passed: 'Dry-run passed — awaiting execution', dry_run_failed: 'Dry-run failed', executing: 'Executing…',
  awaiting_stop: 'Stopping instance…', completed: 'Resize completed', failed: 'Resize failed', rolled_back: 'Rolled back',
};
const RESIZE_STATUS_TONE: Record<RemediationRequest['status'], 'good' | 'warning' | 'critical' | 'neutral'> = {
  pending_approval: 'neutral', rejected: 'critical', approved: 'neutral', dry_run_passed: 'neutral', dry_run_failed: 'critical',
  executing: 'warning', awaiting_stop: 'warning', completed: 'good', failed: 'critical', rolled_back: 'neutral',
};

function RightsizingDetail({ recommendation, resource, cpuHistory, loading, copied, onCopy, onApply, onDismiss, onExclude, onNotifyOwner, resizeRequest, resizeRequesting, onRequestResize, gitInstallations }: {
  recommendation: CostRecommendation;
  resource: CloudResource | null;
  cpuHistory: ResourceMetric[];
  loading: boolean;
  copied: boolean;
  onCopy: (text: string) => void;
  onApply: () => void;
  onDismiss: () => void;
  onExclude: () => void;
  onNotifyOwner: () => void;
  resizeRequest: RemediationRequest | null;
  resizeRequesting: boolean;
  onRequestResize: (targetInstanceType: string) => void;
  gitInstallations: GitInstallation[];
}) {
  const currentType = typeof resource?.metadata.instanceType === 'string' ? resource.metadata.instanceType : null;
  const recommendedType = parseRecommendedType(recommendation.recommended_action);
  const avgCpu = cpuHistory.length > 0 ? cpuHistory.reduce((s, m) => s + m.value, 0) / cpuHistory.length : null;
  const region = resource?.region ?? '';
  const instanceId = resource?.resource_id ?? '';

  const [autoPrInstallationRowId, setAutoPrInstallationRowId] = useState('');
  const [autoPrRepos, setAutoPrRepos] = useState<GitRepo[]>([]);
  const [autoPrReposLoading, setAutoPrReposLoading] = useState(false);
  const [autoPrRepoFullName, setAutoPrRepoFullName] = useState('');
  const [autoPrFilePath, setAutoPrFilePath] = useState('');
  const [autoPrSubmitting, setAutoPrSubmitting] = useState(false);
  const [autoPrResult, setAutoPrResult] = useState<{ prUrl: string } | { error: string } | null>(null);

  // Auto-PR working state is scoped to whichever recommendation is open —
  // React reuses this component instance across different open
  // recommendations (same JSX position in the Drawer), so without this the
  // last recommendation's repo/path selection would leak into the next one.
  useEffect(() => {
    setAutoPrInstallationRowId(''); setAutoPrRepos([]); setAutoPrRepoFullName(''); setAutoPrFilePath(''); setAutoPrResult(null);
  }, [recommendation.id]);

  async function loadAutoPrRepos(installationRowId: string) {
    setAutoPrInstallationRowId(installationRowId);
    setAutoPrRepoFullName('');
    setAutoPrRepos([]);
    if (!installationRowId) return;
    setAutoPrReposLoading(true);
    try {
      const res = await api.getInstallationRepos(installationRowId);
      setAutoPrRepos(res.items);
    } catch {
      setAutoPrRepos([]);
      setAutoPrResult({ error: 'Could not load repositories for this GitHub installation.' });
    } finally {
      setAutoPrReposLoading(false);
    }
  }

  async function submitAutoPr() {
    if (!autoPrInstallationRowId || !autoPrRepoFullName || !autoPrFilePath) return;
    setAutoPrSubmitting(true);
    setAutoPrResult(null);
    try {
      const res = await api.openAutoPr(recommendation.id, { installationRowId: autoPrInstallationRowId, repoFullName: autoPrRepoFullName, filePath: autoPrFilePath });
      try {
        const parsed = new URL(res.prUrl);
        if (parsed.protocol !== 'https:') {
          throw new Error('The pull request URL is not secure.');
        }
        setAutoPrResult({ prUrl: parsed.toString() });
      } catch {
        setAutoPrResult({ error: 'The server returned an invalid pull request URL.' });
      }
    } catch (err) {
      setAutoPrResult({ error: err instanceof ApiError ? err.message : 'Could not open the pull request.' });
    } finally {
      setAutoPrSubmitting(false);
    }
  }

  const safeCliToken = (value: string): string =>
    value.replace(/[^a-zA-Z0-9._:/-]/g, '');

  const safeInstanceId = instanceId ? safeCliToken(instanceId) : '';
  const safeRegion = region ? safeCliToken(region) : '';
  const safeRecommendedType = recommendedType
    ? safeCliToken(recommendedType)
    : '';

  const cliCommands = safeInstanceId && safeRegion && safeRecommendedType
    ? [
        `aws ec2 stop-instances --instance-ids ${instanceId} --region ${region}`,
        `aws ec2 wait instance-stopped --instance-ids ${instanceId} --region ${region}`,
        `aws ec2 modify-instance-attribute --instance-id ${instanceId} --instance-type "{\\"Value\\": \\"${recommendedType}\\"}" --region ${region}`,
        `aws ec2 start-instances --instance-ids ${instanceId} --region ${region}`,
      ].join('\n')
    : null;

  return (
    <div className="flex flex-col gap-5 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={recommendation.priority === 'high' ? 'critical' : recommendation.priority === 'medium' ? 'warning' : 'good'}>{recommendation.priority} priority</Badge>
        {region && <Badge tone="neutral">{region}</Badge>}
        <span className="text-xs text-slate-400 font-mono">{instanceId || recommendation.resource_id}</span>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2">Instance Type</th>
              <th className="px-3 py-2 text-right">Est. Monthly Impact</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100 dark:border-slate-800/60">
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">Current</td>
              <td className="px-3 py-2 font-mono text-slate-800 dark:text-slate-100">{currentType ?? (loading ? '…' : '—')}</td>
              <td className="px-3 py-2 text-right text-slate-400">—</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">Recommended</td>
              <td className="px-3 py-2 font-mono font-medium text-emerald-600 dark:text-emerald-400">{recommendedType ?? '—'}</td>
              <td className="px-3 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">Save {money(recommendation.potential_monthly_savings)}/mo</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">CPU Utilization (last {cpuHistory.length} day{cpuHistory.length === 1 ? '' : 's'} collected)</h3>
          {avgCpu !== null && <span className="text-xs text-slate-400">Avg: {avgCpu.toFixed(1)}%</span>}
        </div>
        {loading ? (
          <div className="h-40 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ) : cpuHistory.length > 0 ? (
          <LineChart series={[{ label: 'CPU %', points: cpuHistory.map(m => ({ x: m.ts, y: m.value })) }]} valueFormatter={v => `${v.toFixed(1)}%`} height={160} />
        ) : (
          <p className="text-xs text-slate-400 py-6 text-center">No CPU history collected yet for this instance.</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Automated Resize</h3>
          {resizeRequest && <Badge tone={RESIZE_STATUS_TONE[resizeRequest.status]}>{RESIZE_STATUS_LABEL[resizeRequest.status]}</Badge>}
        </div>
        {resizeRequest ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <p>Target: <span className="font-mono text-slate-700 dark:text-slate-200">{resizeRequest.target_config?.targetInstanceType ?? recommendedType}</span></p>
            {resizeRequest.status === 'pending_approval' && <p>An admin needs to approve this in Automation → Remediation before it runs.</p>}
            {resizeRequest.status === 'dry_run_failed' && <p>{resizeRequest.dry_run_result?.reason ?? 'The pre-execution dry-run failed — see Automation → Remediation for details.'}</p>}
            {resizeRequest.status === 'awaiting_stop' && <p>Instance is stopping — this page checks progress automatically every few seconds, then resizes and restarts it once stopped.</p>}
            {resizeRequest.status === 'failed' && <p>{resizeRequest.execution_result?.errorMessage ?? resizeRequest.execution_result?.reason ?? 'The resize failed — see Automation → Remediation for details.'}</p>}
            {resizeRequest.status === 'completed' && <p>Resize completed successfully — the instance is running on {resizeRequest.target_config?.targetInstanceType}.</p>}
            {resizeRequest.status === 'rejected' && <p>This request was rejected. Dismiss this recommendation or use the manual CLI steps below instead.</p>}
          </div>
        ) : recommendedType ? (
          <>
            <button type="button" onClick={() => onRequestResize(recommendedType)} disabled={resizeRequesting} className="text-xs px-3 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
              {resizeRequesting ? 'Requesting…' : 'Request Automated Resize'}
            </button>
            <p className="text-xs text-slate-400 mt-2">Goes through an approval + dry-run before anything runs against AWS — this only files the request. HorizonVigil executes it for real (using this account's own stored credentials) once an admin approves it, rather than you running commands yourself.</p>
          </>
        ) : (
          <p className="text-xs text-slate-400">Not enough resource detail to request an automated resize — see the manual CLI steps below instead.</p>
        )}
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Auto-PR (GitHub) — Terraform/Pulumi</div>
        {gitInstallations.length === 0 ? (
          <p className="text-xs text-slate-400">No GitHub repository connected yet — connect one in Settings → Git Integration to open a pull request that updates your Terraform/Pulumi instance_type directly.</p>
        ) : recommendedType && currentType ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-slate-400">Finds <span className="font-mono">instance_type = "{currentType}"</span> (Terraform) or <span className="font-mono">instanceType: "{currentType}"</span> (Pulumi) in the file below and opens a real PR changing it to <span className="font-mono text-emerald-600 dark:text-emerald-400">{recommendedType}</span> — only if it appears exactly once.</p>
            <select value={autoPrInstallationRowId} onChange={e => void loadAutoPrRepos(e.target.value)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5">
              <option value="">Select a GitHub installation…</option>
              {gitInstallations.map(inst => <option key={inst.id} value={inst.id}>{inst.account_login}</option>)}
            </select>
            {autoPrInstallationRowId && (
              <select value={autoPrRepoFullName} onChange={e => setAutoPrRepoFullName(e.target.value)} disabled={autoPrReposLoading} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 disabled:opacity-50">
                <option value="">{autoPrReposLoading ? 'Loading repos…' : 'Select a repository…'}</option>
                {autoPrRepos.map(r => <option key={r.fullName} value={r.fullName}>{r.fullName}</option>)}
              </select>
            )}
            {autoPrRepoFullName && (
              <input value={autoPrFilePath} onChange={e => setAutoPrFilePath(e.target.value)} placeholder="path/to/instance.tf" className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5" />
            )}
            {autoPrRepoFullName && autoPrFilePath && (
              <button type="button" onClick={() => void submitAutoPr()} disabled={autoPrSubmitting} className="self-start text-xs px-3 py-1.5 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50">{autoPrSubmitting ? 'Opening PR…' : 'Open Pull Request'}</button>
            )}
            {autoPrResult && 'prUrl' in autoPrResult && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Pull request opened: <a href={autoPrResult.prUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="underline">{autoPrResult.prUrl}</a></p>
            )}
            {autoPrResult && 'error' in autoPrResult && (
              <p className="text-xs text-red-500">{autoPrResult.error}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Not enough resource detail to open a pull request.</p>
        )}
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Guided Fix — AWS CLI (manual alternative)</div>
        {cliCommands ? (
          <>
            <pre className="rounded-lg bg-slate-900 dark:bg-black text-slate-100 text-xs p-3 overflow-x-auto whitespace-pre">{cliCommands}</pre>
            <button type="button" onClick={() => onCopy(cliCommands)} className="mt-2 text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              {copied ? 'Copied' : 'Copy commands'}
            </button>
            <p className="text-xs text-slate-400 mt-2">Stops the instance (required — AWS rejects an instance-type change while running), resizes it, then starts it back up. There will be real downtime for the duration of the stop/resize/start cycle.</p>
          </>
        ) : (
          <p className="text-xs text-slate-400">{loading ? 'Loading resource details…' : 'Not enough resource detail to generate exact commands — see the recommended action text below instead.'}</p>
        )}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">HorizonVigil only has read-only access to your AWS account and never runs these commands for you — run them yourself (Console or CLI), then mark this done here.</p>

      <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button type="button" onClick={onApply} className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">I've done this — mark as done</button>
        <button type="button" onClick={onNotifyOwner} className="text-xs px-3 py-1.5 rounded-md border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950">Notify Owner</button>
        <button type="button" onClick={onExclude} className="text-xs px-3 py-1.5 rounded-md border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950">Exclude</button>
        <button type="button" onClick={onDismiss} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Dismiss</button>
      </div>
    </div>
  );
}