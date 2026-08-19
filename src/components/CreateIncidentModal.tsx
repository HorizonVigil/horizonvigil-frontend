import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { useFilters } from '../lib/filterContext';
import { useToast } from '../lib/toast';
import { api, ApiError, type CloudResource, type IncidentSeverity } from '../lib/api';

const SEVERITIES: IncidentSeverity[] = ['critical', 'high', 'medium', 'low'];

/**
 * Deliberately few fields — title, severity, an account/resource picker,
 * and a description. No 30-field technical form: "automatic context
 * collection" beyond what a connection/resource picker can supply (region,
 * provider) is out of scope for this pass, see the Incidents V1 plan.
 */
export function CreateIncidentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { connections } = useFilters();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [connectionId, setConnectionId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [resources, setResources] = useState<CloudResource[]>([]);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!connectionId) { setResources([]); setResourceId(''); return; }
    let cancelled = false;
    void api.getResourceInventory({ connectionId, limit: 200 }).then(r => { if (!cancelled) setResources(r.items); });
    return () => { cancelled = true; };
  }, [connectionId]);

  function reset() {
    setTitle(''); setSeverity('medium'); setConnectionId(''); setResourceId(''); setResources([]); setDescription(''); setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.createIncident({
        title: title.trim(),
        severity,
        connectionId: connectionId || undefined,
        resourceId: resourceId || undefined,
        description: description.trim() || undefined,
      });
      toast('Incident created', 'success');
      reset();
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create this incident.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Create Incident" wide>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Title</span>
          <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Production API is returning 502" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Severity</span>
            <select value={severity} onChange={e => setSeverity(e.target.value as IncidentSeverity)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Cloud Account (optional)</span>
            <select value={connectionId} onChange={e => setConnectionId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              <option value="">None</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.provider.toUpperCase()} — {c.name}</option>)}
            </select>
          </label>
        </div>

        {connectionId && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Affected Resource (optional)</span>
            <select value={resourceId} onChange={e => setResourceId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              <option value="">Not a specific resource</option>
              {resources.map(r => <option key={r.id} value={r.id}>{r.resource_name ?? r.resource_id} ({r.resource_type_key})</option>)}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Description</span>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="What's happening, and what impact are you seeing?" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
        </label>

        {error && <p className="text-xs text-red-500">{error}</p>}
        <button type="submit" disabled={loading} className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2 mt-1">
          {loading ? 'Creating…' : 'Create Incident'}
        </button>
      </form>
    </Modal>
  );
}
