import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import type { Environment } from '../lib/api';

const ENVIRONMENTS: Environment[] = ['production', 'staging', 'dev', 'sandbox', 'qa', 'security', 'dr', 'legacy'];
const REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ca-central-1', 'sa-east-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2',
  'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
];
const SUPPORT_PLANS = ['Basic', 'Developer', 'Business', 'Enterprise On-Ramp', 'Enterprise'];

export interface EditAccountFields {
  connectionName: string;
  environment: string;
  defaultRegion?: string;
  supportPlan?: string | null;
}

/**
 * Shared rename/re-environment form for AWS, GCP, and Azure account detail
 * pages — updateAccount/updateGcpAccount/updateAzureAccount all existed with
 * no UI calling them until this. Scoped to the fields every provider agrees
 * cover the core "I connected this with the wrong name/environment" case
 * (name, environment, plus region/support-plan where the provider has them)
 * rather than re-exposing the full connect wizard (project reassignment,
 * per-region scan toggles) here too.
 */
export function EditAccountModal({
  open, onClose, onSave,
  connectionName, environment, defaultRegion, supportPlan, showRegion, showSupportPlan,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (fields: EditAccountFields) => Promise<void>;
  connectionName: string;
  environment: string;
  defaultRegion?: string;
  supportPlan?: string | null;
  showRegion: boolean;
  showSupportPlan: boolean;
}) {
  const [name, setName] = useState(connectionName);
  const [env, setEnv] = useState(environment);
  const [region, setRegion] = useState(defaultRegion ?? 'us-east-1');
  const [plan, setPlan] = useState(supportPlan ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(connectionName);
    setEnv(environment);
    setRegion(defaultRegion ?? 'us-east-1');
    setPlan(supportPlan ?? '');
    setError(null);
  }, [open, connectionName, environment, defaultRegion, supportPlan]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        connectionName: name.trim(),
        environment: env,
        defaultRegion: showRegion ? region : undefined,
        supportPlan: showSupportPlan ? (plan || null) : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Account">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Name</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Environment</span>
          <select value={env} onChange={e => setEnv(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
            {ENVIRONMENTS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        {showRegion && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Default Region</span>
            <select value={region} onChange={e => setRegion(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        )}
        {showSupportPlan && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">AWS Support Plan (optional)</span>
            <select value={plan} onChange={e => setPlan(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              <option value="">Not set</option>
              {SUPPORT_PLANS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={saving} className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2 mt-1">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </Modal>
  );
}
