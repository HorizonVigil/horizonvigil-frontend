import { useEffect, useState } from 'react';
import { listMfaFactors, enrollTotp, verifyTotp, unenrollTotp, type TotpFactor } from '../lib/mfa';

/** Self-contained so Settings.tsx doesn't need to thread MFA state through its already-large Profile tab. */
export function MfaSettings() {
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setFactors(await listMfaFactors());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function startEnroll() {
    setError(null);
    setBusy(true);
    try {
      setEnrolling(await enrollTotp());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    setError(null);
    setBusy(true);
    try {
      await verifyTotp(enrolling.factorId, code);
      setEnrolling(null);
      setCode('');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(factorId: string) {
    setError(null);
    setBusy(true);
    try {
      await unenrollTotp(factorId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const verified = factors.filter(f => f.status === 'verified');

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Two-factor authentication</h3>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : enrolling ? (
        <form onSubmit={confirmEnroll} className="flex flex-col gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Scan this with your authenticator app, or enter the code manually.</p>
          <img src={enrolling.qrCode} alt="TOTP QR code" className="h-40 w-40 self-center rounded-md border border-slate-200 dark:border-slate-700" />
          <div className="text-[11px] font-mono text-center text-slate-400 dark:text-slate-500 break-all">{enrolling.secret}</div>
          <input
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="6-digit code"
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-center tracking-[0.3em] text-slate-900 dark:text-white"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || code.length !== 6} className="flex-1 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-1.5">
              {busy ? 'Verifying…' : 'Verify & enable'}
            </button>
            <button type="button" onClick={() => { setEnrolling(null); setError(null); }} className="rounded-md border border-slate-200 dark:border-slate-700 px-3 text-sm text-slate-600 dark:text-slate-300">
              Cancel
            </button>
          </div>
        </form>
      ) : verified.length > 0 ? (
        <div className="flex flex-col gap-2">
          {verified.map(f => (
            <div key={f.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Authenticator app enabled
              </span>
              <button onClick={() => void remove(f.id)} disabled={busy} className="text-xs text-red-500 hover:underline disabled:opacity-60">Remove</button>
            </div>
          ))}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">Not enabled. Add an authenticator app for a required second step at sign-in.</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button onClick={() => void startEnroll()} disabled={busy} className="self-start rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60">
            {busy ? 'Starting…' : 'Enable two-factor authentication'}
          </button>
        </div>
      )}
    </div>
  );
}
