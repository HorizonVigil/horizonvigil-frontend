import { useState } from 'react';
import { Modal } from './Modal';
import { api, type Project, type Environment } from '../lib/api';
import { LEAST_PRIVILEGE_POLICY } from '../lib/leastPrivilegePolicy';

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

export function ConnectAwsAccountWizard({ open, onClose, onConnected, projects }: { open: boolean; onClose: () => void; onConnected: () => void; projects: Project[] }) {
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

  function toggleRegion(r: string) {
    setScanRegions(prev => (prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (scanRegions.length === 0) { setError('Select at least one region to scan.'); return; }
    setLoading(true);
    try {
      await api.createConnection({
        connectionMethod: method,
        awsAccountId: form.awsAccountId.trim(),
        accessKeyId: method === 'access_key' ? form.accessKeyId.trim() : undefined,
        secretAccessKey: method === 'access_key' ? form.secretAccessKey.trim() : undefined,
        roleArn: method === 'cross_account_role' ? form.roleArn.trim() : undefined,
        externalId: method === 'cross_account_role' ? form.externalId.trim() : undefined,
        defaultRegion: form.defaultRegion,
        scanRegions,
        projectId: form.projectId || undefined,
        connectionName: form.connectionName || undefined,
        environment: form.environment,
      });
      onConnected();
      onClose();
    } catch (err) {
      setError((err as Error).message);
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
          <li>IAM → Users → Create user (e.g. <code>cloudops360-readonly</code>), programmatic access only — no console password.</li>
          <li>Attach managed policies <code>ReadOnlyAccess</code> + <code>SecurityAudit</code>, or the <button type="button" onClick={() => setShowPolicy(v => !v)} className="text-brand-600 dark:text-brand-400 underline">hardened custom policy</button> below.</li>
          <li>Download the access key CSV immediately — the secret is shown once.</li>
          <li>Paste the Account ID + keys here. We validate via <code>sts:GetCallerIdentity</code> and encrypt the secret at rest — it's never shown again.</li>
        </ol>
      ) : (
        <ol className="text-xs text-slate-500 dark:text-slate-400 list-decimal list-inside space-y-1 mb-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3">
          <li>In your AWS account, create an IAM role trusting CloudOps360's platform account, with the external ID below.</li>
          <li>Attach <code>ReadOnlyAccess</code> + <code>SecurityAudit</code>, or the hardened custom policy.</li>
          <li>Paste the role ARN and external ID here — we call <code>sts:AssumeRole</code> for each scan, nothing to rotate.</li>
        </ol>
      )}

      {showPolicy && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Hardened least-privilege policy (read-only, no secret contents)</span>
            <button type="button" onClick={() => void navigator.clipboard.writeText(LEAST_PRIVILEGE_POLICY)} className="text-xs text-brand-600 dark:text-brand-400">Copy</button>
          </div>
          <pre className="text-[10px] leading-tight bg-slate-900 text-slate-200 rounded-lg p-3 overflow-auto max-h-48">{LEAST_PRIVILEGE_POLICY}</pre>
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
            <Field label="Role ARN" required value={form.roleArn} onChange={v => setForm(f => ({ ...f, roleArn: v }))} placeholder="arn:aws:iam::123456789012:role/CloudOps360Read" />
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
