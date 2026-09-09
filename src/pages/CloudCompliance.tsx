import { useEffect, useState, useCallback } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import { useTabParam } from '../lib/useTabParam';
import { api, ApiError, type ComplianceOverview, type ComplianceFramework, type ComplianceControl, type ControlEvaluation, type ComplianceException } from '../lib/api';

/**
 * Cloud Compliance — its own module at its own canonical route (§10.2).
 *
 * It was a tab inside Cloud Security, reading a V2-namespaced endpoint, with
 * both sidebar entries marking themselves active at once.
 *
 * What this page has to get right is the empty case, because on this estate
 * that is the real case. Measured 2026-09-09: zero control evaluations, and
 * the live capability probe reports `compliance_config: not_enabled` because
 * AWS Config has no configuration recorder. §10.2: "If no trustworthy control
 * evaluation exists, show `Not configured` with setup guidance... Do not show
 * a compliance score."
 *
 * So there is no score here until evidence exists, and no percentage derived
 * from an empty table. A compliance score is something a customer may put in
 * front of an auditor; inventing one would be the most consequential false
 * number this product could print.
 */

const TABS = ['Overview', 'Frameworks', 'Controls', 'Evidence', 'Exceptions'] as const;
type Tab = typeof TABS[number];

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
function when(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

/** Neutral for anything unproven. A green badge is a claim. */
function stateTone(state: string): 'good' | 'warning' | 'neutral' {
  if (state === 'available') return 'good';
  if (state === 'partial' || state === 'stale' || state === 'failed' || state === 'permission_denied') return 'warning';
  return 'neutral';
}

const RESULT_TONE: Record<string, 'good' | 'critical' | 'warning' | 'neutral'> = {
  passed: 'good', failed: 'critical', error: 'warning', permission_denied: 'warning',
  not_evaluated: 'neutral', not_applicable: 'neutral',
};

export default function CloudCompliance() {
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  const [overview, setOverview] = useState<ComplianceOverview | null>(null);
  const [frameworks, setFrameworks] = useState<ComplianceFramework[]>([]);
  const [controls, setControls] = useState<ComplianceControl[]>([]);
  const [evidence, setEvidence] = useState<ControlEvaluation[]>([]);
  const [exceptions, setExceptions] = useState<ComplianceException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Settled, not all: one failing section must not blank the page. This is
    // the same defect Cloud Security had with Promise.all.
    const [o, f, c, e, x] = await Promise.allSettled([
      api.getComplianceOverview(),
      api.getComplianceFrameworks(),
      api.getComplianceControls({ limit: 200 }),
      api.getComplianceEvidence({ limit: 200 }),
      api.getComplianceExceptions({ limit: 200 }),
    ]);
    if (o.status === 'fulfilled') setOverview(o.value);
    else setError(o.reason instanceof ApiError ? o.reason.message : 'Could not load compliance status.');
    if (f.status === 'fulfilled') setFrameworks(f.value.items);
    if (c.status === 'fulfilled') setControls(c.value.items);
    if (e.status === 'fulfilled') setEvidence(e.value.items);
    if (x.status === 'fulfilled') setExceptions(x.value.items);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const availability = overview?.availability;
  const evaluated = availability?.canRenderZero === true;

  const controlColumns: Column<ComplianceControl>[] = [
    { key: 'key', header: 'Control', render: r => r.control_key, sortValue: r => r.control_key },
    { key: 'title', header: 'Title', render: r => r.title, sortValue: r => r.title },
    { key: 'test', header: 'Automated check', render: r => r.test_identifier ?? <span className="text-slate-400">None mapped</span>, sortValue: r => r.test_identifier ?? '' },
    {
      key: 'evaluated', header: 'Status',
      render: r => <Badge tone={r.evaluated ? 'neutral' : 'warning'}>{r.evaluated ? 'Has a check' : 'Not evaluated'}</Badge>,
      sortValue: r => String(r.evaluated),
    },
  ];

  const evidenceColumns: Column<ControlEvaluation>[] = [
    { key: 'result', header: 'Result', render: r => <Badge tone={RESULT_TONE[r.result] ?? 'neutral'}>{r.result.replace(/_/g, ' ')}</Badge>, sortValue: r => r.result },
    { key: 'source', header: 'Source', render: r => r.source, sortValue: r => r.source },
    { key: 'scope', header: 'Scope', render: r => `${r.scope_type}${r.scope_id ? `: ${r.scope_id}` : ''}`, sortValue: r => r.scope_type },
    { key: 'observed', header: 'Provider observed', render: r => when(r.source_observed_at), sortValue: r => r.source_observed_at ?? '' },
    { key: 'collected', header: 'Collected', render: r => when(r.collected_at), sortValue: r => r.collected_at },
    { key: 'checksum', header: 'Evidence', render: r => r.raw_evidence_checksum ? <span className="font-mono text-xs">{r.raw_evidence_checksum.slice(0, 12)}…</span> : <span className="text-slate-400">—</span>, sortValue: r => r.raw_evidence_checksum ?? '' },
  ];

  const exceptionColumns: Column<ComplianceException>[] = [
    { key: 'justification', header: 'Justification', render: r => r.justification, sortValue: r => r.justification },
    { key: 'scope', header: 'Scope', render: r => `${r.scope_type}${r.scope_id ? `: ${r.scope_id}` : ''}`, sortValue: r => r.scope_type },
    { key: 'expires', header: 'Expires', render: r => <span className={r.expired ? 'text-amber-600 dark:text-amber-400' : ''}>{when(r.expires_at)}</span>, sortValue: r => r.expires_at },
    { key: 'state', header: 'State', render: r => <Badge tone={r.expired ? 'warning' : 'neutral'}>{r.expired ? 'Expired' : 'Active'}</Badge>, sortValue: r => String(r.expired) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Cloud Compliance</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Provider-native control evidence for your connected cloud accounts.
        </p>
      </div>

      {/* The limitation is stated once, at the top, on every tab -- not
          buried in a tooltip. Provider technical checks are not an audit,
          and a customer must not be able to read this page as certification. */}
      {overview?.limitations && (
        <p className="text-xs text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-3">
          {overview.limitations}
        </p>
      )}

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist">
        {TABS.map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t ? 'border-brand-500 text-brand-600 dark:text-brand-400 font-medium' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <div className="h-40 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ) : tab === 'Overview' ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* An em dash, not 0% and not 100%. Neither is true when nothing
                has been evaluated, and both would be believed. */}
            <StatCard label="Compliance score" value={overview?.score !== null && overview?.score !== undefined ? `${overview.score}%` : '—'}
              caption={overview?.score === null || overview?.score === undefined ? 'Not evaluated' : overview?.scoreBasis ? `${overview.scoreBasis.passed} of ${overview.scoreBasis.evaluated} controls passing` : undefined} />
            <StatCard label="Frameworks" value={String(overview?.frameworks ?? 0)} />
            <StatCard label="Controls evaluated" value={String(overview?.controlsEvaluated ?? 0)} />
            <StatCard label="Connections in scope" value={String(availability?.coverage.expected ?? 0)}
              caption={availability ? `${availability.coverage.covered} evaluated` : undefined} />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Evidence source</span>
              {availability && <Badge tone={stateTone(availability.state)}>{availability.state.replace(/_/g, ' ')}</Badge>}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{availability?.message}</p>
            {/* Setup guidance rather than an empty dashboard: the customer is
                told exactly what to switch on, in their own cloud. */}
            {overview?.setupGuidance && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">{overview.setupGuidance}</p>
            )}
          </div>

          {!evaluated && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Compliance reports stay unavailable until controls have been evaluated. A report generated now would state
              conclusions no evidence supports.
            </p>
          )}
        </div>
      ) : tab === 'Frameworks' ? (
        frameworks.length === 0 ? (
          <EmptyState message="No compliance frameworks are configured for this organization yet." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {frameworks.map(f => (
              <div key={f.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-medium text-slate-900 dark:text-slate-50">{f.name}</h2>
                  <Badge tone="neutral">v{f.version}</Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{f.publisher ?? 'Publisher not stated'} · {f.evidence_basis.replace(/_/g, ' ')}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{f.limitations}</p>
              </div>
            ))}
          </div>
        )
      ) : tab === 'Controls' ? (
        controls.length === 0
          ? <EmptyState message="No controls are defined yet. Controls appear once a framework is configured for your organization." />
          : <DataTable rows={controls} columns={controlColumns} rowKey={r => r.id} />
      ) : tab === 'Evidence' ? (
        evidence.length === 0
          ? <EmptyState message="No control evaluations have been collected. Each evaluation records its source, the exact check that ran, the period it covers, and a checksum of the raw provider evidence." />
          : <DataTable rows={evidence} columns={evidenceColumns} rowKey={r => r.id} />
      ) : (
        exceptions.length === 0
          ? <EmptyState message="No compliance exceptions have been recorded. An exception documents an accepted risk against a specific control, and always carries an expiry date." />
          : <DataTable rows={exceptions} columns={exceptionColumns} rowKey={r => r.id} />
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}
