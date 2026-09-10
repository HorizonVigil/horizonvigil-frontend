import { useState } from 'react';
import { Modal } from './Modal';
import { api, type ProjectRow, type Environment } from '../lib/api';
import { LEAST_PRIVILEGE_POLICY, CUR_S3_READ_POLICY_STATEMENT } from '../lib/leastPrivilegePolicy';
import { useSync } from '../lib/syncContext';
import { useToast } from '../lib/toast';
import { AWS_REGION_GROUPS, DEFAULT_SCAN_REGIONS, partitionForRegion } from '../lib/awsRegions';

// Region lists now live in lib/awsRegions.ts, grouped by partition -- see
// the note there on why the scan path was never limited by this list.
const ENVIRONMENTS: Environment[] = ['production', 'staging', 'dev', 'sandbox', 'qa', 'security', 'dr', 'legacy'];

export function ConnectAwsAccountWizard({ open, onClose, onConnected, projects }: { open: boolean; onClose: () => void; onConnected: () => void; projects: ProjectRow[] }) {
  // Defaults to access keys because that is the only certified path today.
  // Cross-account role stays visible but disabled -- see the option below.
  const [method, setMethod] = useState<'access_key' | 'cross_account_role'>('access_key');
  const [showPolicy, setShowPolicy] = useState(false);
  const [form, setForm] = useState({
    awsAccountId: '', accessKeyId: '', secretAccessKey: '', roleArn: '', externalId: '',
    defaultRegion: 'us-east-1', projectId: '', connectionName: '', environment: 'production' as Environment,
  });
  // Discovery loops over every region here for the regional scanners (EC2, RDS,
  // Lambda, ...) — defaults to all standard regions so an account isn't
  // silently limited to just its primary region with no indication anything
  // else was skipped.
  const [scanRegions, setScanRegions] = useState<string[]>([...DEFAULT_SCAN_REGIONS]);

  /**
   * Scan regions are limited to the partition the chosen default region
   * belongs to.
   *
   * AWS credentials are issued within one partition -- a commercial access
   * key cannot reach `cn-north-1`, and a GovCloud key cannot reach
   * `us-east-1`. Offering every region in one flat list would offer choices
   * guaranteed to produce permission errors on every scan, and a wall of
   * those is its own false signal about the account's health.
   */
  const selectedPartition = partitionForRegion(form.defaultRegion);
  const selectableRegions = AWS_REGION_GROUPS.find(g => g.partition === selectedPartition)?.regions ?? [];
  const partitionNote = AWS_REGION_GROUPS.find(g => g.partition === selectedPartition)?.note ?? null;
  const [error, setError] = useState<string | null>(null);
  /** Set when the server reports 409 connection_already_exists — the wizard shows the existing connection instead of mutating it. */
  const [duplicate, setDuplicate] = useState<{ id: string; name: string; status: string } | null>(null);
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
    setDuplicate(null);
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
      /**
       * A duplicate is a conflict to REPORT, never a credential rotation to
       * perform.
       *
       * 2026-09-08 AWS connector audit, AWS-P0-03: this used to match on the
       * raw database constraint name and then call
       * updateAccountCredentials/updateAccountRole -- so submitting "Add
       * account" twice silently replaced the credentials of an existing
       * connection. Creating and rotating have different blast radius and
       * different authorization stories; one must never become the other by
       * accident. Rotation now only happens where the user asked for it, in
       * the credential-update flow.
       *
       * The server owns this decision now (409 connection_already_exists),
       * so the client no longer parses error strings to infer intent.
       */
      const apiErr = err as { status?: number; body?: { code?: string; existingConnection?: { id: string; name: string; status: string } } };
      const conflict = apiErr.status === 409 && apiErr.body?.code === 'connection_already_exists' ? apiErr.body.existingConnection : null;
      if (conflict) {
        setDuplicate(conflict);
        setError(null);
        setLoading(false);
        return;
      }
      setError((err as Error).message);
      setLoading(false);
      return;
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add AWS Account" wide>
      <div className="flex gap-2 mb-4">
        {/*
          AWS-P0-02 (2026-09-08 connector audit): this option was default-
          selected, badged "Recommended", and submittable, on the same screen
          that admitted live sts:AssumeRole scanning was not wired up -- so a
          customer could finish onboarding into a connection that could never
          collect anything. It is disabled until the AssumeRole acceptance
          suite passes, and the server refuses the method too, so this is a
          real gate rather than a hidden button.
        */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Cross-account role onboarding is not available in this build."
          className="flex-1 text-left rounded-lg border p-3 border-slate-200 dark:border-slate-700 opacity-60 cursor-not-allowed"
        >
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
            Cross-Account Role <span className="text-slate-500 dark:text-slate-400 text-xs font-normal">Not available yet</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">STS AssumeRole onboarding is not enabled in this build. Use IAM access keys below.</div>
        </button>
        <button onClick={() => setMethod('access_key')} className={`flex-1 text-left rounded-lg border p-3 ${method === 'access_key' ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">IAM User + Access Keys</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Long-lived keys — rotate every 90 days</div>
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
            {AWS_REGION_GROUPS.map(g => (
              <optgroup key={g.partition} label={g.label}>
                {g.regions.map(r => <option key={r} value={r}>{r}</option>)}
              </optgroup>
            ))}
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
              <button type="button" onClick={() => setScanRegions([...selectableRegions])} className="text-brand-600 dark:text-brand-400 hover:underline">All</button>
              <button type="button" onClick={() => setScanRegions([])} className="text-brand-600 dark:text-brand-400 hover:underline">None</button>
            </div>
          </div>
          {partitionNote && (
            <p className="mb-1 text-xs text-amber-700 dark:text-amber-400">{partitionNote}</p>
          )}
          <div className="grid grid-cols-3 gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 p-2">
            {selectableRegions.map(r => (
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

        {/*
          A duplicate is reported, never silently resolved by mutating the
          existing connection's credentials (AWS-P0-03). The user is told what
          already exists and taken to it; rotating a credential stays an
          explicit, separately-authorized action.
        */}
        {duplicate && (
          <div className="col-span-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              {duplicate.status === 'disconnected'
                ? 'This AWS account already has a disconnected connection'
                : 'This AWS account is already connected'}
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
              {duplicate.name} — nothing was created or changed. To replace its credentials, open the connection and use Update Credentials.
            </p>
            <a
              href={`/cloud-accounts/${duplicate.id}`}
              className="inline-block mt-2 text-xs font-medium text-brand-700 dark:text-brand-300 underline"
            >
              Open existing connection
            </a>
          </div>
        )}
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
