import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Badge } from '../components/Badge';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { useFilters } from '../lib/filterContext';
import { useToast } from '../lib/toast';
import { api, ApiError, type IncidentDetail as IncidentDetailData, type IncidentStatus, type IncidentSeverity, type Member, type VerificationRun } from '../lib/api';

const SEVERITY_TONE: Record<IncidentSeverity, 'critical' | 'serious' | 'warning' | 'good'> = { critical: 'critical', high: 'serious', medium: 'warning', low: 'good' };
const STATUS_TONE: Record<IncidentStatus, 'warning' | 'neutral' | 'good'> = { open: 'warning', acknowledged: 'neutral', investigating: 'neutral', resolved: 'good', closed: 'good' };
const STATUSES: IncidentStatus[] = ['open', 'acknowledged', 'investigating', 'resolved', 'closed'];
const CHECK_TONE: Record<'pass' | 'fail' | 'skipped', 'good' | 'critical' | 'neutral'> = { pass: 'good', fail: 'critical', skipped: 'neutral' };

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString();
}

function eventLabel(event: IncidentDetailData['events'][number], memberName: (id: string | null) => string): string {
  if (event.event_type === 'created') return `${memberName(event.actor_id)} created this incident`;
  if (event.event_type === 'status_changed') {
    const meta = event.metadata as { from?: string; to?: string };
    return `${memberName(event.actor_id)} changed status from ${meta.from ?? '?'} to ${meta.to ?? '?'}`;
  }
  if (event.event_type === 'assigned') {
    const meta = event.metadata as { assigneeId?: string | null };
    return meta.assigneeId ? `${memberName(event.actor_id)} assigned this to ${memberName(meta.assigneeId)}` : `${memberName(event.actor_id)} unassigned this incident`;
  }
  if (event.event_type === 'verified') return `${memberName(event.actor_id)} ran verification`;
  return `${memberName(event.actor_id)} commented`;
}

export function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const { connections } = useFilters();
  const { toast } = useToast();
  const [incident, setIncident] = useState<IncidentDetailData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [filingJira, setFilingJira] = useState(false);
  const [verifyUrl, setVerifyUrl] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [latestRun, setLatestRun] = useState<VerificationRun | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRequestRef = useRef(0);
  const verificationRequestRef = useRef(0);

  const load = useCallback(async () => {
    if (!id) return;

    const requestId = ++loadRequestRef.current;
    const hasExistingIncident = Boolean(incident);

    setLoadError(null);
    setRefreshing(hasExistingIncident);

    try {
      const data = await api.getIncident(id);
      if (requestId !== loadRequestRef.current) return;
      setIncident(data);
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      const message = err instanceof ApiError ? err.message : 'Could not load this incident.';
      setLoadError(message);
      if (!hasExistingIncident) toast(message, 'error');
    } finally {
      if (requestId === loadRequestRef.current) setRefreshing(false);
    }
  }, [id, incident, toast]);

  const loadLatestVerification = useCallback(async () => {
    if (!id) return;

    const requestId = ++verificationRequestRef.current;

    try {
      const { runs } = await api.getIncidentVerifications(id);
      if (requestId !== verificationRequestRef.current) return;
      setLatestRun(runs[0] ?? null);
      setVerificationError(null);
    } catch (err) {
      if (requestId !== verificationRequestRef.current) return;
      setVerificationError(
        err instanceof ApiError ? err.message : 'Could not load verification history.',
      );
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadLatestVerification(); }, [loadLatestVerification]);

  useEffect(() => {
    let cancelled = false;

    void api.getMembers()
      .then(result => {
        if (cancelled) return;
        setMembers(result.members);
        setMembersError(null);
      })
      .catch(err => {
        if (cancelled) return;
        setMembersError(
          err instanceof ApiError ? err.message : 'Could not load incident members.',
        );
      });

    return () => { cancelled = true; };
  }, []);

  async function runVerification() {
    if (!id || verifying) return;

    const trimmedUrl = verifyUrl.trim();

    if (trimmedUrl) {
      try {
        const parsed = new URL(trimmedUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      } catch {
        setVerificationError('Enter a valid HTTP or HTTPS health-check URL.');
        return;
      }
    }

    setVerifying(true);
    setVerificationError(null);

    try {
      const run = await api.verifyIncident(id, trimmedUrl || undefined);
      setLatestRun(run);
      await load();
      toast(
        run.overall_status === 'passed'
          ? 'Verification passed'
          : 'Verification failed — see checks below',
        run.overall_status === 'passed' ? 'success' : 'error',
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not run verification';
      setVerificationError(message);
      toast(message, 'error');
    } finally {
      setVerifying(false);
    }
  }

  const memberName = (userId: string | null) => {
    if (!userId) return 'Someone';
    const m = members.find(x => x.userId === userId);
    return m?.fullName ?? m?.email ?? userId;
  };

  async function fileJiraIssue() {
    if (!incident || filingJira) return;
    setFilingJira(true);
    try {
      const res = await api.createJiraIssue({
        summary: `[${incident.severity.toUpperCase()}] ${incident.incident_number} — ${incident.title}`,
        description: [
          incident.description,
          connection ? `Account: ${connection.provider.toUpperCase()} — ${connection.name}` : null,
        ].filter(Boolean).join('\n\n'),
      });
      toast(`Filed as ${res.key}`, 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to file Jira issue.', 'error');
    } finally {
      setFilingJira(false);
    }
  }

  async function changeStatus(status: IncidentStatus) {
    if (!id || busy || status === incident?.status) return;

    setBusy(true);
    try {
      await api.updateIncidentStatus(id, status);
      await load();
      toast(`Status changed to ${status}`, 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not change status', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function assign(assigneeId: string) {
    if (!id || busy || assigneeId === (incident?.assigned_to ?? '')) return;

    setBusy(true);
    try {
      await api.assignIncident(id, assigneeId || null);
      await load();
      toast(assigneeId ? 'Incident assigned' : 'Incident unassigned', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not assign this incident', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();

    const trimmedComment = comment.trim();
    if (!id || busy || !trimmedComment) return;

    if (trimmedComment.length > 5000) {
      toast('Comment must be 5,000 characters or fewer.', 'error');
      return;
    }

    setBusy(true);
    try {
      await api.addIncidentComment(id, trimmedComment);
      setComment('');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not add comment', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!incident) {
    if (loadError) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center px-4">
          <div
            className="max-w-md w-full rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/20 p-6 text-center"
            role="alert"
          >
            <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
              Couldn’t load this incident
            </h2>
            <p className="mt-1 text-xs text-red-700 dark:text-red-400 break-words">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-3 py-1.5"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading incident">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  const connection = incident.connection_id ? connections.find(c => c.id === incident.connection_id) : null;

  return (
    <div>
      <FilterBar
        title={`${incident.incident_number} — ${incident.title}`}
        breadcrumb={<Link to="/incidents" className="text-xs text-slate-400 hover:underline">← Incidents</Link>}
        showAccountFilter={false}
        showRegionFilter={false}
        showDateFilter={false}
      />

      {loadError && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs">
          <span className="text-amber-800 dark:text-amber-300">{loadError}</span>
          <button type="button" disabled={refreshing} onClick={() => void load()} className="shrink-0 text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-50">
            {refreshing ? 'Refreshing…' : 'Retry'}
          </button>
        </div>
      )}

      {membersError && (
        <div role="status" className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Assignee list could not be loaded. Existing assignments remain visible.
        </div>
      )}

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Badge tone={SEVERITY_TONE[incident.severity] ?? 'warning'}>{incident.severity}</Badge>
        <Badge tone={STATUS_TONE[incident.status] ?? 'neutral'}>{incident.status}</Badge>
        {connection && <span className="text-xs text-slate-400">{connection.provider.toUpperCase()} — {connection.name}</span>}
        <div className="flex-1" />
        {refreshing && <span className="text-xs text-slate-400" aria-live="polite">Refreshing…</span>}
        <button type="button" onClick={() => void load()} disabled={refreshing || busy} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
          Refresh
        </button>
        <button type="button" onClick={() => void fileJiraIssue()} disabled={filingJira} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
          {filingJira ? 'Filing…' : 'File Jira Issue'}
        </button>
        <select aria-label="Incident status" disabled={busy} value={incident.status} onChange={e => void changeStatus(e.target.value as IncidentStatus)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200 disabled:opacity-50">
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Incident assignee" disabled={busy || Boolean(membersError)} value={incident.assigned_to ?? ''} onChange={e => void assign(e.target.value)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200 disabled:opacity-50">
          <option value="">Unassigned</option>
          {members.map(m => <option key={m.userId} value={m.userId}>{m.fullName ?? m.email}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
          {incident.description && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Description</h3>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{incident.description}</p>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Timeline</h3>
            <ul className="flex flex-col gap-3">
              {incident.events.map(event => (
                <li key={event.id} className="text-sm border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                  <div className="text-slate-700 dark:text-slate-200">{eventLabel(event, memberName)}</div>
                  {(event.event_type === 'comment' || event.event_type === 'verified') && event.comment && <div className="text-slate-500 dark:text-slate-400 mt-0.5 whitespace-pre-wrap">{event.comment}</div>}
                  <div className="text-[11px] text-slate-400 mt-0.5">{formatDate(event.created_at)}</div>
                </li>
              ))}
            </ul>

            <form onSubmit={submitComment} className="mt-4 flex flex-col gap-2">
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="Add a comment…" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
              <button type="submit" disabled={busy || !comment.trim()} className="self-end text-xs rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5">Comment</button>
            </form>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-sm">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Details</h3>
            <dl className="flex flex-col gap-2">
              <div className="flex justify-between"><dt className="text-slate-400">Created by</dt><dd className="text-slate-700 dark:text-slate-200">{memberName(incident.created_by)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Created</dt><dd className="text-slate-700 dark:text-slate-200">{formatDate(incident.created_at)}</dd></div>
              {incident.environment && <div className="flex justify-between"><dt className="text-slate-400">Environment</dt><dd className="text-slate-700 dark:text-slate-200">{incident.environment}</dd></div>}
              {incident.resolved_at && <div className="flex justify-between"><dt className="text-slate-400">Resolved</dt><dd className="text-slate-700 dark:text-slate-200">{formatDate(incident.resolved_at)}</dd></div>}
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-sm">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Verification</h3>
            <p className="text-[11px] text-slate-400 mb-3">Real checks — CloudWatch alarms, resource status, latest deployment, and an optional live HTTP request. Never a fabricated pass.</p>
            <input
              type="url"
              inputMode="url"
              maxLength={2048}
              value={verifyUrl}
              onChange={e => {
                setVerifyUrl(e.target.value);
                if (verificationError) setVerificationError(null);
              }}
              aria-label="Optional health-check URL"
              placeholder="Optional: URL to health-check (e.g. https://…)"
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white mb-2"
            />
            {verificationError && (
              <div role="alert" className="mb-2 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/20 px-2.5 py-2 text-xs text-red-700 dark:text-red-300">
                {verificationError}
              </div>
            )}
            <button type="button" onClick={() => void runVerification()} disabled={verifying} className="w-full rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-medium py-2 mb-3">
              {verifying ? 'Running checks…' : 'Run Verification'}
            </button>
            {latestRun ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Last run {formatDate(latestRun.run_at)}</span>
                  <Badge tone={latestRun.overall_status === 'passed' ? 'good' : 'critical'}>{latestRun.overall_status}</Badge>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {latestRun.checks.map(chk => (
                    <li key={chk.name} className="flex items-start justify-between gap-2 text-xs">
                      <div>
                        <div className="text-slate-700 dark:text-slate-200">{chk.name.replace(/_/g, ' ')}</div>
                        <div className="text-slate-400">{chk.detail}</div>
                      </div>
                      <Badge tone={CHECK_TONE[chk.status] ?? 'neutral'}>{chk.status}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-slate-400">No verification runs yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}