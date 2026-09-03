/**
 * Cloud Accounts — "What HorizonVigil can access" transparency surface
 * (spec §29–30). Two halves:
 *   - CAN: the real read-only permission-validation checks, granted/denied.
 *   - CANNOT: the actions HorizonVigil never performs (static posture — the
 *     platform is read-only for cloud resources; the only writes are the
 *     opt-in Safe Automated Remediation flow, gated separately).
 */
import { Icon } from '../icons';
import type { PermissionCheckResult } from '../../lib/api';

const CANNOT_DO = [
  'Modify or delete cloud resources',
  'Change IAM / RBAC policies or role assignments',
  'Read secret values (Secrets Manager, Key Vault, Secret Manager contents)',
  'Make production changes',
  'Move data out of your cloud',
];

export function AccessMatrix({
  checks,
  lastCheckedAt,
  onRevalidate,
  revalidating,
}: {
  checks: PermissionCheckResult[];
  lastCheckedAt: string | null;
  onRevalidate?: () => void;
  revalidating?: boolean;
}) {
  const granted = checks.filter((c) => c.status === 'granted');
  const denied = checks.filter((c) => c.status === 'denied' || c.status === 'error');
  const missing = denied.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {checks.length === 0
            ? 'Permission validation has not been run for this environment yet.'
            : `Based on the last validation${lastCheckedAt ? ` (${new Date(lastCheckedAt).toLocaleString()})` : ''}.`}
        </p>
        {onRevalidate && (
          <button type="button" onClick={onRevalidate} disabled={revalidating}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50">
            {revalidating ? 'Revalidating…' : 'Revalidate access'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5">
            <Icon name="check-circle" size={14} className="text-emerald-500" /> HorizonVigil can access
          </h3>
          {checks.length === 0 ? (
            <p className="text-xs text-slate-400">Run validation to populate this.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {granted.map((c) => (
                <li key={c.service} className="flex items-start gap-2 text-sm">
                  <Icon name="check" size={13} className="text-emerald-500 shrink-0 mt-1" />
                  <span className="text-slate-600 dark:text-slate-300">{c.label}</span>
                </li>
              ))}
              {denied.map((c) => (
                <li key={c.service} className="flex items-start gap-2 text-sm">
                  <Icon name="x" size={13} className="text-amber-500 shrink-0 mt-1" />
                  <span className="text-slate-500 dark:text-slate-400">{c.label} <span className="text-amber-600 dark:text-amber-400">— {c.status}</span></span>
                </li>
              ))}
            </ul>
          )}
          {missing > 0 && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
              {missing} permission{missing === 1 ? '' : 's'} unavailable — some discovery or analysis will be incomplete until the role is widened.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5">
            <Icon name="lock" size={14} className="text-slate-400" /> HorizonVigil cannot
          </h3>
          <ul className="flex flex-col gap-1.5">
            {CANNOT_DO.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <Icon name="x" size={13} className="text-slate-400 shrink-0 mt-1" />
                <span className="text-slate-600 dark:text-slate-300">{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            The access above is read-only. The one exception is Safe Automated Remediation (Automation → Remediation), which is opt-in,
            per-action, and requires an explicit approval step.
          </p>
        </div>
      </div>
    </div>
  );
}
