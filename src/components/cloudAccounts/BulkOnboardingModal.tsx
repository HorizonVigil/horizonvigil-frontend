/**
 * Cloud Accounts — Bulk onboarding from an AWS Organization (spec §34).
 *
 * Prerequisites (surfaced in the Settings tab): (1) the Organizations
 * management account is connected as a normal connection, (2) the
 * HorizonVigilRead role StackSet is deployed org-wide with the external ID
 * from Settings. This flow: pick that connection → preview (no writes) →
 * confirm → import → poll each new connection's status for a live progress
 * roll-up.
 *
 * Azure (management-group / tenant) and GCP (folder / org) bulk import are a
 * backend follow-up — only AWS is wired today.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Modal';
import { Icon } from '../icons';
import { api, friendlyErrorMessage } from '../../lib/api';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';

type Phase = 'pick' | 'preview' | 'importing' | 'done';

export function BulkOnboardingModal({
  open, onClose, rows, onImported,
}: {
  open: boolean;
  onClose: () => void;
  rows: UnifiedAccountRow[];
  onImported: () => void;
}) {
  const awsRows = useMemo(() => rows.filter((r) => r.provider === 'aws' && r.connectionMethod === 'cross_account_role'), [rows]);
  const [phase, setPhase] = useState<Phase>('pick');
  const [managementId, setManagementId] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.getAwsBulkImportPreview>> | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.bulkImportAwsFromOrg>> | null>(null);
  const [progress, setProgress] = useState<{ connected: number; syncing: number; pending: number; failed: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setPhase('pick'); setError(null); setPreview(null); setResult(null); setProgress(null); setManagementId(awsRows[0]?.id ?? ''); }
  }, [open, awsRows]);

  async function runPreview() {
    if (!managementId) return;
    setBusy(true); setError(null);
    try {
      const p = await api.getAwsBulkImportPreview(managementId);
      setPreview(p);
      setPhase('preview');
    } catch (err) {
      setError(friendlyErrorMessage(err, 'Preview failed — is this connection your Organization management account?'));
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true); setError(null); setPhase('importing');
    try {
      const r = await api.bulkImportAwsFromOrg({ managementConnectionId: managementId, environment });
      setResult(r);
      // Poll the imported connections' statuses for a progress roll-up.
      const ids = r.connections.map((c) => c.id);
      for (let i = 0; i < 20 && ids.length > 0; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        const statuses = await Promise.allSettled(ids.map((id) => api.getAccount(id)));
        const counts = { connected: 0, syncing: 0, pending: 0, failed: 0 };
        for (const s of statuses) {
          if (s.status !== 'fulfilled') { counts.failed++; continue; }
          const st = s.value.status;
          if (st === 'connected') counts.connected++;
          else if (st === 'error' || st === 'expired') counts.failed++;
          else counts.pending++;
        }
        setProgress(counts);
        if (counts.pending === 0) break;
      }
      onImported();
      setPhase('done');
    } catch (err) {
      setError(friendlyErrorMessage(err, 'Bulk import failed.'));
      setPhase('preview');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bulk onboard from AWS Organization" wide>
      {awsRows.length === 0 ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 flex flex-col gap-2">
          <p>Bulk onboarding needs your AWS Organizations <strong>management account</strong> connected first, using a cross-account role.</p>
          <p className="text-xs">Connect it via <strong>+ Connect Cloud → AWS → Cross-Account Role</strong>, deploy the HorizonVigilRead role StackSet across your Organization (Settings tab has the external ID + template), then come back here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {phase === 'pick' && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">Management account connection</span>
                <select value={managementId} onChange={(e) => setManagementId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2">
                  {awsRows.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.identifier})</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">Environment for imported accounts</span>
                <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2">
                  {['production', 'staging', 'dev', 'sandbox', 'qa', 'security', 'dr', 'legacy'].map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => void runPreview()} disabled={busy || !managementId} className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
                {busy ? 'Checking…' : 'Preview accounts'}
              </button>
            </>
          )}

          {phase === 'preview' && preview && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="In Organization" value={preview.active} />
                <Stat label="Already connected" value={preview.alreadyConnected} />
                <Stat label="Will import" value={preview.importable} tone="brand" />
              </div>
              {preview.overLimit > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">{preview.overLimit} accounts are above the 2,000-per-call limit and won't be imported in this run.</p>
              )}
              {preview.sample.length > 0 && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Sample: {preview.sample.map((s) => s.name).join(', ')}{preview.importable > preview.sample.length ? '…' : ''}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setPhase('pick')} className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm py-2 hover:bg-slate-50 dark:hover:bg-slate-800">Back</button>
                <button type="button" onClick={() => void runImport()} disabled={busy || preview.importable === 0} className="flex-1 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
                  Import {preview.importable} account{preview.importable === 1 ? '' : 's'}
                </button>
              </div>
            </>
          )}

          {(phase === 'importing' || phase === 'done') && (
            <div className="flex flex-col gap-3">
              {result && <p className="text-sm text-slate-700 dark:text-slate-200">Created {result.imported} connection{result.imported === 1 ? '' : 's'}. Discovery is running.</p>}
              {progress && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Stat label="Connected" value={progress.connected} tone="good" />
                  <Stat label="In progress" value={progress.pending} />
                  <Stat label="Syncing" value={progress.syncing} />
                  <Stat label="Failed" value={progress.failed} tone={progress.failed > 0 ? 'bad' : undefined} />
                </div>
              )}
              {phase === 'importing' && <p className="text-xs text-slate-400 flex items-center gap-1.5"><Icon name="refresh-cw" size={12} className="animate-spin" /> Polling status…</p>}
              {phase === 'done' && <button type="button" onClick={onClose} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2">Done</button>}
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'brand' | 'good' | 'bad' }) {
  const cls = tone === 'brand' ? 'text-brand-600 dark:text-brand-400' : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100';
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 py-2">
      <div className={`text-lg font-semibold tabular-nums ${cls}`}>{value.toLocaleString()}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
