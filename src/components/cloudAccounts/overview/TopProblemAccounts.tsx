import { useNavigate } from 'react-router-dom';
import { ProviderMark } from './ProviderMark';
import { SectionCard } from './primitives';
import { PROVIDER_LABEL, type ProblemAccount } from '../../../lib/cloudAccounts/overview';

/** Spec §26 — compact "top accounts requiring attention" table with a row action. */
export function TopProblemAccounts({
  rows,
  onValidate,
}: {
  rows: ProblemAccount[];
  onValidate?: (connectionId: string) => void;
}) {
  const navigate = useNavigate();
  if (rows.length === 0) return null;

  return (
    <SectionCard title="Top Accounts Requiring Attention" icon="alert-triangle">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <th className="font-medium py-1.5 pr-3">Environment</th>
              <th className="font-medium py-1.5 pr-3">Provider</th>
              <th className="font-medium py-1.5 pr-3">Issue</th>
              <th className="font-medium py-1.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => (
              <tr key={r.connectionId || `row-${i}`}>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/cloud-accounts/${r.connectionId}`)}
                    className="font-medium text-slate-700 dark:text-slate-200 hover:underline truncate max-w-[14rem] text-left"
                  >
                    {r.connectionName}
                  </button>
                </td>
                <td className="py-2 pr-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <ProviderMark provider={r.provider} size={15} /> {PROVIDER_LABEL[r.provider]}
                  </span>
                </td>
                <td className="py-2 pr-3 text-slate-500 dark:text-slate-400 text-xs">{r.issue}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => navigate(`/cloud-accounts/${r.connectionId}`)}
                    className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    View
                  </button>
                  {onValidate && (
                    <button
                      type="button"
                      onClick={() => onValidate(r.connectionId)}
                      className="ml-3 text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline"
                    >
                      Validate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
