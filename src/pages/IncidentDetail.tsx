import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Badge } from '../components/Badge';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { useFilters } from '../lib/filterContext';
import { useToast } from '../lib/toast';
import { api, ApiError, type IncidentDetail as IncidentDetailData, type IncidentStatus, type IncidentSeverity, type Member } from '../lib/api';

const SEVERITY_TONE: Record<IncidentSeverity, 'critical' | 'serious' | 'warning' | 'good'> = { critical: 'critical', high: 'serious', medium: 'warning', low: 'good' };
const STATUS_TONE: Record<IncidentStatus, 'warning' | 'neutral' | 'good'> = { open: 'warning', acknowledged: 'neutral', investigating: 'neutral', resolved: 'good', closed: 'good' };
const STATUSES: IncidentStatus[] = ['open', 'acknowledged', 'investigating', 'resolved', 'closed'];

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

  const load = useCallback(async () => {
    if (!id) return;
    const data = await api.getIncident(id);
    setIncident(data);
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void api.getMembers().then(r => setMembers(r.members)); }, []);

  const memberName = (userId: string | null) => {
    if (!userId) return 'Someone';
    const m = members.find(x => x.userId === userId);
    return m?.fullName ?? m?.email ?? userId;
  };

  async function changeStatus(status: IncidentStatus) {
    if (!id) return;
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
    if (!id) return;
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
    if (!id || !comment.trim()) return;
    setBusy(true);
    try {
      await api.addIncidentComment(id, comment.trim());
      setComment('');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not add comment', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!incident) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      </div>
    );
  }

  const connection = incident.connection_id ? connections.find(c => c.id === incident.connection_id) : null;

  return (
    <div>
      <FilterBar title={incident.title} breadcrumb={<Link to="/incidents" className="text-xs text-slate-400 hover:underline">← Incidents</Link>} showAccountFilter={false} />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Badge tone={SEVERITY_TONE[incident.severity]}>{incident.severity}</Badge>
        <Badge tone={STATUS_TONE[incident.status]}>{incident.status}</Badge>
        {connection && <span className="text-xs text-slate-400">{connection.provider.toUpperCase()} — {connection.name}</span>}
        <div className="flex-1" />
        <select disabled={busy} value={incident.status} onChange={e => void changeStatus(e.target.value as IncidentStatus)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200 disabled:opacity-50">
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select disabled={busy} value={incident.assigned_to ?? ''} onChange={e => void assign(e.target.value)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200 disabled:opacity-50">
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
                  {event.event_type === 'comment' && event.comment && <div className="text-slate-500 dark:text-slate-400 mt-0.5 whitespace-pre-wrap">{event.comment}</div>}
                  <div className="text-[11px] text-slate-400 mt-0.5">{new Date(event.created_at).toLocaleString()}</div>
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
              <div className="flex justify-between"><dt className="text-slate-400">Created</dt><dd className="text-slate-700 dark:text-slate-200">{new Date(incident.created_at).toLocaleString()}</dd></div>
              {incident.environment && <div className="flex justify-between"><dt className="text-slate-400">Environment</dt><dd className="text-slate-700 dark:text-slate-200">{incident.environment}</dd></div>}
              {incident.resolved_at && <div className="flex justify-between"><dt className="text-slate-400">Resolved</dt><dd className="text-slate-700 dark:text-slate-200">{new Date(incident.resolved_at).toLocaleString()}</dd></div>}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
