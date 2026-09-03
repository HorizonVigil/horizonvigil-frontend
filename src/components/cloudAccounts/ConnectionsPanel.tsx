/**
 * Cloud Accounts — Connections tab (spec §13–16). A "connection" is how
 * HorizonVigil establishes trust with a provider; it can front many
 * environments. HorizonVigil has no first-class Connection entity yet, so
 * this is a derived, honest grouping (see lib/cloudAccounts/connections.ts).
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../Badge';
import { EmptyState } from '../EmptyState';
import { Icon } from '../icons';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';
import { deriveConnections, connectionState } from '../../lib/cloudAccounts/connections';

const STATE_TONE = { connected: 'good', warning: 'warning', error: 'critical', pending: 'neutral' } as const;

export function ConnectionsPanel({ rows, onAddConnection }: { rows: UnifiedAccountRow[]; onAddConnection: () => void }) {
  const navigate = useNavigate();
  const connections = useMemo(() => deriveConnections(rows), [rows]);

  if (connections.length === 0) {
    return (
      <EmptyState icon="cloud" title="No cloud connections yet"
        description="A connection is how HorizonVigil establishes trust with AWS, Azure or GCP — one connection can bring in many accounts."
        action={{ label: '+ Connect Cloud', onClick: onAddConnection }} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-400">
        Grouped by how trust was established. An "Organization" connection is a set of AWS cross-account roles sharing one external ID —
        what bulk onboarding from an AWS Organization produces.
      </p>
      {connections.map((conn) => {
        const state = connectionState(conn);
        return (
          <div key={conn.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{conn.label}</span>
                  <Badge tone="neutral">{conn.provider.toUpperCase()}</Badge>
                  <Badge tone={STATE_TONE[state]}>{state}</Badge>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {conn.connectionType} · {conn.accountCount} environment{conn.accountCount === 1 ? '' : 's'}
                  {conn.environments.length > 0 && ` · ${conn.environments.join(', ')}`}
                  {conn.lastSync && ` · last sync ${new Date(conn.lastSync).toLocaleString()}`}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                {Object.entries(conn.statusCounts).map(([s, n]) => (
                  <span key={s} className="tabular-nums">{n} {s}</span>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {conn.accountIds.slice(0, 12).map((id) => {
                const row = rows.find((r) => r.id === id);
                return (
                  <button key={id} type="button" onClick={() => navigate(`/cloud-accounts/${id}`)}
                    className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                    {row?.name ?? id}
                  </button>
                );
              })}
              {conn.accountIds.length > 12 && (
                <span className="text-xs text-slate-400 self-center flex items-center gap-1">
                  <Icon name="more" size={12} /> +{conn.accountIds.length - 12} more
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
