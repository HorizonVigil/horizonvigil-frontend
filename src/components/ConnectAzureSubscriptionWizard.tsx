import { useState } from 'react';
import { Modal } from './Modal';
import { api, type ProjectRow, type Environment } from '../lib/api';
import { AZURE_RECOMMENDED_ROLE, AZURE_ROLE_DESCRIPTION, SERVICE_PRINCIPAL_STEPS } from '../lib/azureRequiredPermissions';

const ENVIRONMENTS: Environment[] = ['production', 'staging', 'dev', 'sandbox', 'qa', 'security', 'dr', 'legacy'];

export function ConnectAzureSubscriptionWizard({ open, onClose, onConnected, projects }: { open: boolean; onClose: () => void; onConnected: () => void; projects: ProjectRow[] }) {
  const [form, setForm] = useState({
    azureSubscriptionId: '', azureTenantId: '', azureClientId: '', azureClientSecret: '',
    projectId: '', connectionName: '', environment: 'production' as Environment,
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
      await api.createAzureAccount({
        azureSubscriptionId: form.azureSubscriptionId.trim(),
        azureTenantId: form.azureTenantId.trim(),
        azureClientId: form.azureClientId.trim(),
        azureClientSecret: form.azureClientSecret.trim(),
        projectId: form.projectId || undefined,
        connectionName: form.connectionName.trim() || form.azureSubscriptionId.trim(),
        environment: form.environment,
      });
      onConnected();
      onClose();
    } catch (err) {
      const message = (err as Error).message;
      const isDuplicateSubscription = message.includes('cloud_connections_org_azure') || message.toLowerCase().includes('already exists');
      if (!isDuplicateSubscription) {
        setError(message);
        setLoading(false);
        return;
      }

      // Same "update in place" fallback as ConnectGcpProjectWizard — a row
      // for this subscription already exists (Disconnect is a soft status
      // flip, not a row delete, so it collides with the unique index on
      // re-add regardless of status).
      try {
        const { items } = await api.getAzureAccounts({ search: form.azureSubscriptionId.trim(), limit: 5 });
        const existing = items.find((c) => c.azure_subscription_id === form.azureSubscriptionId.trim());
        if (!existing) {
          setError(`Azure subscription ${form.azureSubscriptionId.trim()} is already connected to this org, but its existing connection couldn't be found to update automatically.`);
          return;
        }
        await api.updateAzureAccountCredentials(existing.id, { azureClientSecret: form.azureClientSecret.trim() });
        setNotice('This subscription was already connected — its client secret was rotated instead of creating a duplicate.');
        onConnected();
        onClose();
      } catch (fallbackErr) {
        setError(`This Azure subscription is already connected, and updating it also failed: ${(fallbackErr as Error).message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Azure Subscription" wide>
      <ol className="text-xs text-slate-500 dark:text-slate-400 list-decimal list-inside space-y-1 mb-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3">
        {SERVICE_PRINCIPAL_STEPS.map((step, i) => <li key={i}>{step}</li>)}
      </ol>
      <p className="text-xs text-slate-400 mb-4">{AZURE_ROLE_DESCRIPTION} ({AZURE_RECOMMENDED_ROLE})</p>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <Field label="Subscription ID" required value={form.azureSubscriptionId} onChange={v => setForm(f => ({ ...f, azureSubscriptionId: v }))} placeholder="00000000-0000-0000-0000-000000000000" />
        <Field label="Connection Name" value={form.connectionName} onChange={v => setForm(f => ({ ...f, connectionName: v }))} placeholder="Production" />
        <Field label="Directory (Tenant) ID" required value={form.azureTenantId} onChange={v => setForm(f => ({ ...f, azureTenantId: v }))} placeholder="00000000-0000-0000-0000-000000000000" />
        <Field label="Application (Client) ID" required value={form.azureClientId} onChange={v => setForm(f => ({ ...f, azureClientId: v }))} placeholder="00000000-0000-0000-0000-000000000000" />
        <label className="flex flex-col gap-1 text-sm col-span-2">
          <span className="text-slate-600 dark:text-slate-300">Client Secret</span>
          <input
            required type="password" value={form.azureClientSecret} onChange={e => setForm(f => ({ ...f, azureClientSecret: e.target.value }))}
            placeholder="The secret VALUE, not the secret ID"
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white font-mono text-xs placeholder:text-slate-400"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Environment</span>
          <select value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value as Environment }))} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
            {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Project (optional)</span>
          <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
            <option value="">Unassigned</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        {notice && <p className="col-span-2 text-sm rounded-md border border-brand-200 dark:border-brand-900 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300 px-3 py-2">{notice}</p>}
        {error && <p className="col-span-2 text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={loading} className="col-span-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2 mt-1">
          {loading ? 'Validating & connecting…' : 'Connect Azure Subscription'}
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
