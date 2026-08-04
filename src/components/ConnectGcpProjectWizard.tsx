import { useState } from 'react';
import { Modal } from './Modal';
import { api, type ProjectRow, type Environment } from '../lib/api';
import { GCP_RECOMMENDED_ROLE, GCP_ROLE_DESCRIPTION, SERVICE_ACCOUNT_KEY_STEPS, SERVICE_ACCOUNT_IMPERSONATION_STEPS } from '../lib/gcpRequiredPermissions';

const ENVIRONMENTS: Environment[] = ['production', 'staging', 'dev', 'sandbox', 'qa', 'security', 'dr', 'legacy'];
// GCP regions aren't a call-fanout concern for Phase 1's scanners (all four
// are project-wide, single-call APIs — see gcp-accounts-api/routes/discovery.ts)
// the way they are for AWS, so this is just a display default, not a
// multi-region checklist like ConnectAwsAccountWizard's.
const REGIONS = ['us-central1', 'us-east1', 'us-east4', 'us-west1', 'europe-west1', 'europe-west4', 'asia-east1', 'asia-southeast1', 'australia-southeast1'];

export function ConnectGcpProjectWizard({ open, onClose, onConnected, projects }: { open: boolean; onClose: () => void; onConnected: () => void; projects: ProjectRow[] }) {
  const [method, setMethod] = useState<'service_account_key' | 'service_account_impersonation'>('service_account_key');
  const [form, setForm] = useState({
    gcpProjectId: '', serviceAccountKeyJson: '', impersonatedServiceAccount: '',
    defaultRegion: 'us-central1', projectId: '', connectionName: '', environment: 'production' as Environment,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await api.createGcpAccount({
        connectionMethod: method,
        gcpProjectId: form.gcpProjectId.trim(),
        serviceAccountKeyJson: method === 'service_account_key' ? form.serviceAccountKeyJson.trim() : undefined,
        impersonatedServiceAccount: method === 'service_account_impersonation' ? form.impersonatedServiceAccount.trim() : undefined,
        defaultRegion: form.defaultRegion,
        projectId: form.projectId || undefined,
        connectionName: form.connectionName || undefined,
        environment: form.environment,
      });
      onConnected();
      onClose();
    } catch (err) {
      const message = (err as Error).message;
      const isDuplicateProject = message.includes('cloud_connections_org_gcp_project_uk');
      if (!isDuplicateProject) {
        setError(message);
        setLoading(false);
        return;
      }

      // Same "update in place" fallback as ConnectAwsAccountWizard — a row
      // for this GCP project already exists (Disconnect is a soft status
      // flip, not a row delete, so it collides with the partial unique
      // index on re-add regardless of status).
      try {
        const { items } = await api.getGcpAccounts({ search: form.gcpProjectId.trim(), limit: 5 });
        const existing = items.find((c) => c.gcp_project_id === form.gcpProjectId.trim());
        if (!existing) {
          setError(`GCP project ${form.gcpProjectId.trim()} is already connected to this org, but its existing connection couldn't be found to update automatically.`);
          return;
        }
        if (existing.connection_method !== method) {
          setMethod(existing.connection_method);
          setNotice(
            `This GCP project is already connected using ${existing.connection_method === 'service_account_key' ? 'a service account key' : 'service account impersonation'} — switched the form to match. Fill in the fields above and submit again to update it, or close this and use the "…" menu on its Account Inventory row to Disconnect or permanently Delete it instead.`,
          );
          return;
        }
        if (method === 'service_account_key') {
          await api.updateGcpAccountCredentials(existing.id, { serviceAccountKeyJson: form.serviceAccountKeyJson.trim() });
        } else {
          await api.updateGcpAccount(existing.id, {});
        }
        onConnected();
        onClose();
      } catch (fallbackErr) {
        setError(`This GCP project is already connected, and updating it also failed: ${(fallbackErr as Error).message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  const steps = method === 'service_account_key' ? SERVICE_ACCOUNT_KEY_STEPS : SERVICE_ACCOUNT_IMPERSONATION_STEPS;

  return (
    <Modal open={open} onClose={onClose} title="Add GCP Project" wide>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMethod('service_account_key')} className={`flex-1 text-left rounded-lg border p-3 ${method === 'service_account_key' ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Service Account Key</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Quickest path — a downloaded JSON key, stored encrypted</div>
        </button>
        <button onClick={() => setMethod('service_account_impersonation')} className={`flex-1 text-left rounded-lg border p-3 ${method === 'service_account_impersonation' ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Service Account Impersonation <span className="text-emerald-600 dark:text-emerald-400 text-xs font-normal">Recommended</span></div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">No key ever stored — grant our platform account permission to impersonate yours</div>
        </button>
      </div>

      <ol className="text-xs text-slate-500 dark:text-slate-400 list-decimal list-inside space-y-1 mb-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3">
        {steps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>
      <p className="text-xs text-slate-400 mb-4">{GCP_ROLE_DESCRIPTION} ({GCP_RECOMMENDED_ROLE})</p>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <Field label="GCP Project ID" required value={form.gcpProjectId} onChange={v => setForm(f => ({ ...f, gcpProjectId: v }))} placeholder="my-project-123456" />
        <Field label="Connection Name" value={form.connectionName} onChange={v => setForm(f => ({ ...f, connectionName: v }))} placeholder="Production" />

        {method === 'service_account_key' ? (
          <label className="flex flex-col gap-1 text-sm col-span-2">
            <span className="text-slate-600 dark:text-slate-300">Service Account Key (JSON)</span>
            <textarea
              required value={form.serviceAccountKeyJson} onChange={e => setForm(f => ({ ...f, serviceAccountKeyJson: e.target.value }))}
              rows={5} placeholder='{"type": "service_account", "project_id": "...", ...}'
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white font-mono text-xs placeholder:text-slate-400"
            />
          </label>
        ) : (
          <Field
            label="Service Account Email" required value={form.impersonatedServiceAccount}
            onChange={v => setForm(f => ({ ...f, impersonatedServiceAccount: v }))} placeholder="cloudops360-readonly@my-project.iam.gserviceaccount.com"
          />
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Default Region</span>
          <select value={form.defaultRegion} onChange={e => setForm(f => ({ ...f, defaultRegion: e.target.value }))} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Environment</span>
          <select value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value as Environment }))} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
            {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm col-span-2">
          <span className="text-slate-600 dark:text-slate-300">Project (optional)</span>
          <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
            <option value="">Unassigned</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        {notice && <p className="col-span-2 text-sm rounded-md border border-brand-200 dark:border-brand-900 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300 px-3 py-2">{notice}</p>}
        {error && <p className="col-span-2 text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={loading} className="col-span-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2 mt-1">
          {loading ? 'Validating & connecting…' : 'Connect GCP Project'}
        </button>
      </form>
    </Modal>
  );
}

function Field({ label, onChange, ...props }: { label: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <input {...props} onChange={e => onChange(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400" />
    </label>
  );
}
