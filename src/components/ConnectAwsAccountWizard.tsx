import { useState } from 'react';
import { Modal } from './Modal';
import { api, type ProjectRow, type Environment } from '../lib/api';
import { LEAST_PRIVILEGE_POLICY, CUR_S3_READ_POLICY_STATEMENT } from '../lib/leastPrivilegePolicy';
import { useSync } from '../lib/syncContext';
import { useToast } from '../lib/toast';

// Every AWS region enabled by default (no opt-in required) — this list
// previously had only 9 of these 17, silently missing ap-south-1 (Mumbai)
// among others, so a connected account's real EC2 instances there never
// showed up anywhere in discovery. The backend also independently confirms
// a new connection's real enabled regions via ec2:DescribeRegions at
// connect time (including any opt-in regions), so this list just needs to
// cover the common case for the checklist UI, not be exhaustive.
const REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ca-central-1', 'sa-east-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2',
  'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
];
const ENVIRONMENTS: Environment[] = ['production', 'staging', 'dev', 'sandbox', 'qa', 'security', 'dr', 'legacy'];

export function ConnectAwsAccountWizard({ open, onClose, onConnected, projects }: { open: boolean; onClose: () => void; onConnected: () => void; projects: ProjectRow[] }) {
  const [method, setMethod] = useState<'access_key' | 'cross_account_role'>('cross_account_role');
  const [showPolicy, setShowPolicy] = useState(false);
  const [form, setForm] = useState({
    awsAccountId: '', accessKeyId: '', secretAccessKey: '', roleArn: '', externalId: '',
    defaultRegion: 'us-east-1', projectId: '', connectionName: '', environment: 'production' as Environment,
  });
  // Discovery loops over every region here for the regional scanners (EC2, RDS,
  // Lambda, ...) — defaults to all standard regions so an account isn't
  // silently limited to just its primary region with no indication anything
  // else was skipped.
  const [scanRegions, setScanRegions] = useState<string[]>(REGIONS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { startDiscovery } = useSync();
  const { toast } = useToast();

  function toggleRegion(r: string) {
    setScanRegions(prev => (prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]));
  }

  /** Kicks off the same "Discover Resources" + "Sync Cost from AWS" calls the account detail page's buttons make, so a newly (re)connected account doesn't sit empty until someone finds those buttons manually. Fire-and-forget — startDiscovery already tracks its own progress in syncContext, and the account detail page picks that up via useSyncCompletion whenever the user lands there. */
  function autoSync(connectionId: string) {
    startDiscovery(connectionId);
    void api.syncAccountCost(connectionId).catch(() => {});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (scanRegions.length === 0) { setError('Select at least one region to scan.'); return; }
    setLoading(true);
    try {
      const created = await api.createAccount({
        connectionMethod: method,
        awsAccountId: form.awsAccountId.trim(),
        accessKeyId: method === 'access_key' ? form.accessKeyId.trim() : undefined,
        secretAccessKey: method === 'access_key' ? form.secretAccessKey.trim() : undefined,
        roleArn: method === 'cross_account_role' ? form.roleArn.trim() : undefined,
        externalId: method === 'cross_account_role' ? form.externalId.trim() : undefined,
        defaultRegion: form.defaultRegion,
        scanRegions,
        projectId: form.projectId || undefined,
        connectionName: form.connectionName.trim() || form.awsAccountId.trim(),
        environment: form.environment,
      });
      autoSync(created.id);
      if (created.planLimitWarning) toast(created.planLimitWarning, 'info');
      onConnected();
      onClose();
    } catch (err) {
      const message = (err as Error).message;
      const isDuplicateAccount = message.includes('cloud_connections_org_id_aws_account_id_key');
      if (!isDuplicateAccount) {
        setError(message);
        setLoading(false);
        return;
      }

      // A row for this AWS account already exists (disconnect is a soft
      // status-flip, not a row delete, so it collides with the org+account
      // unique constraint on re-add regardless of status). Look it up and
      // update it in place instead of making the user find a separate flow —
      // but the update shape (credentials vs. role) depends on the EXISTING
      // connection's method, not whichever toggle happened to be selected
      // here, since this wizard defaults to cross-account-role.
      try {
        const { items } = await api.getAccounts({ search: form.awsAccountId.trim(), limit: 5 });
        const existing = items.find((c) => c.aws_account_id === form.awsAccountId.trim());
        if (!existing) {
          setError(`AWS account ${form.awsAccountId.trim()} is already connected to this org, but its existing connection couldn't be found to update automatically.`);
          return;
        }
        if (existing.connection_method !== method) {
          setMethod(existing.connection_method);
          setError(
            `This AWS account is already connected using ${existing.connection_method === 'access_key' ? 'IAM access keys' : 'a cross-account role'} — switched the form to match. Fill in ${existing.connection_method === 'access_key' ? 'the access keys' : 'the role ARN and external ID'} above and submit again to update it.`,
          );
          return;
        }
        if (method === 'access_key') {
          await api.updateAccountCredentials(existing.id, { accessKeyId: form.accessKeyId.trim(), secretAccessKey: form.secretAccessKey.trim() });
        } else {
          await api.updateAccountRole(existing.id, { roleArn: form.roleArn.trim(), externalId: form.externalId.trim() });
        }
        autoSync(existing.id);
        onConnected();
        onClose();
      } catch (fallbackErr) {
        setError(`This AWS account is already connected, and updating it also failed: ${(fallbackErr as Error).message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add AWS Account" wide>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMethod('cross_account_role')} className={`flex-1 text-left rounded-lg border p-3 ${method === 'cross_account_role' ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Cross-Account Role <span className="text-emerald-600 dark:text-emerald-400 text-xs font-normal">Recommended</span></div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">STS AssumeRole, 1-hour temp credentials, nothing to rotate or leak (§7.2)</div>
        </button>
        <button onClick={() => setMethod('access_key')} className={`flex-1 text-left rounded-lg border p-3 ${method === 'access_key' ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">IAM User + Access Keys</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Quickest path — long-lived keys, rotate every 90 days (§7.1)</div>
        </button>
      </div>

      {method === 'access_key' ? (
        <ol className="text-xs text-slate-500 dark:text-slate-400 list-decimal list-inside space-y-1 mb-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3">
          <li>IAM → Users → Create user (e.g. <code>horizonvigil-readonly</code>), programmatic access only — no console password.</li>
          <li>Attach managed policies <code>ReadOnlyAccess</code> + <code>SecurityAudit</code>, or the <button type="button" onClick={() => setShowPolicy(v => !v)} className="text-brand-600 dark:text-brand-400 underline">hardened custom policy</button> below.</li>
          <li>Download the access key CSV immediately — the secret is shown once.</li>
          <li>Paste the Account ID + keys here. We encrypt the secret at rest and never show it again — live validation against AWS isn't performed yet, only that the credentials are present and well-formed.</li>
        </ol>
      ) : (
        <ol className="text-xs text-slate-500 dark:text-slate-400 list-decimal list-inside space-y-1 mb-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3">
          <li>In your AWS account, create an IAM role trusting HorizonVigil's platform account, with the external ID below.</li>
          <li>Attach <code>ReadOnlyAccess</code> + <code>SecurityAudit</code>, or the hardened custom policy.</li>
          <li>Paste the role ARN and external ID here — nothing long-lived to store or rotate. (Live scanning via <code>sts:AssumeRole</code> isn't wired up yet in this build.)</li>
        </ol>
      )}

      {showPolicy && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Hardened least-privilege policy (read-only, no secret contents)</span>
            <button type="button" onClick={() => void navigator.clipboard.writeText(LEAST_PRIVILEGE_POLICY)} className="text-xs text-brand-600 dark:text-brand-400">Copy</button>
          </div>
          <pre className="text-[10px] leading-tight bg-slate-900 text-slate-200 rounded-lg p-3 overflow-auto max-h-48">{LEAST_PRIVILEGE_POLICY}</pre>
          <p className="text-xs text-slate-400 mt-3">
            Optional, add later: if you set up an AWS Cost & Usage Report (Billing console → Cost & Usage Reports, with "Include resource IDs" checked), add
            this extra statement — scoped to that report's own S3 bucket only — to unlock real per-resource cost. Not required to connect.
          </p>
          <pre className="text-[10px] leading-tight bg-slate-900 text-slate-200 rounded-lg p-3 overflow-auto max-h-32 mt-1">{CUR_S3_READ_POLICY_STATEMENT}</pre>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <Field label="AWS Account ID" required value={form.awsAccountId} onChange={v => setForm(f => ({ ...f, awsAccountId: v }))} placeholder="123456789012" />
        <Field label="Connection Name" value={form.connectionName} onChange={v => setForm(f => ({ ...f, connectionName: v }))} placeholder="Production" />

        {method === 'access_key' ? (
          <>
            <Field label="Access Key ID" required value={form.accessKeyId} onChange={v => setForm(f => ({ ...f, accessKeyId: v }))} placeholder="AKIA…" />
            <Field label="Secret Access Key" required type="password" value={form.secretAccessKey} onChange={v => setForm(f => ({ ...f, secretAccessKey: v }))} />
          </>
        ) : (
          <>
            <Field label="Role ARN" required value={form.roleArn} onChange={v => setForm(f => ({ ...f, roleArn: v }))} placeholder="arn:aws:iam::123456789012:role/HorizonVigilRead" />
            <Field label="External ID" required value={form.externalId} onChange={v => setForm(f => ({ ...f, externalId: v }))} />
          </>
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
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-slate-600 dark:text-slate-300">Regions to Scan</span>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => setScanRegions(REGIONS)} className="text-brand-600 dark:text-brand-400 hover:underline">All</button>
              <button type="button" onClick={() => setScanRegions([])} className="text-brand-600 dark:text-brand-400 hover:underline">None</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 p-2">
            {REGIONS.map(r => (
              <label key={r} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={scanRegions.includes(r)} onChange={() => toggleRegion(r)} />
                {r}
              </label>
            ))}
          </div>
          {scanRegions.length === 0 && <p className="text-xs text-red-500 mt-1">Select at least one region.</p>}
        </div>

        <label className="flex flex-col gap-1 text-sm col-span-2">
          <span className="text-slate-600 dark:text-slate-300">Project (optional)</span>
          <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
            <option value="">Unassigned</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        {error && <p className="col-span-2 text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={loading} className="col-span-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2 mt-1">
          {loading ? 'Validating & connecting…' : 'Connect AWS Account'}
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
