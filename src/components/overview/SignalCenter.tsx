/**
 * The context banner (issue §15 level 3 / §5 "Executive Signal Center").
 * Surfaces the 1–3 most severe live signals with a deep link. Each signal is
 * individually dismissible (remembered in preferences for 12h).
 */
import { useMemo } from 'react';
import { Icon, type IconName } from '../icons';
import type { ContextSignals } from '../../lib/overview/types';

const DISMISS_TTL_MS = 12 * 60 * 60 * 1000;

interface Signal { key: string; icon: IconName; text: string; to: string; tone: 'critical' | 'warning' }

function buildSignals(s: ContextSignals): Signal[] {
  const out: Signal[] = [];
  if (s.criticalIncidents > 0) out.push({ key: 'incidents', icon: 'incidents', tone: 'critical', to: '/incidents?tab=Open', text: `${s.criticalIncidents} open incident${s.criticalIncidents === 1 ? '' : 's'} need attention` });
  if (s.criticalAlerts > 0) out.push({ key: 'alerts', icon: 'alerts', tone: 'critical', to: '/alerts', text: `${s.criticalAlerts} critical alert${s.criticalAlerts === 1 ? '' : 's'} firing` });
  if (s.criticalVulns > 0) out.push({ key: 'vulns', icon: 'shield-alert', tone: 'critical', to: '/vulnerability-management?tab=Security Findings&preset=critical', text: `${s.criticalVulns} critical vulnerabilit${s.criticalVulns === 1 ? 'y' : 'ies'} open` });
  if (s.openAttackPaths > 0) out.push({ key: 'attack-paths', icon: 'target', tone: 'critical', to: '/vulnerability-management', text: `${s.openAttackPaths} attack path${s.openAttackPaths === 1 ? '' : 's'} detected` });
  if (s.failedDeployments > 0) out.push({ key: 'deploys', icon: 'automation', tone: 'warning', to: '/monitoring?tab=Health', text: `${s.failedDeployments} deployment${s.failedDeployments === 1 ? '' : 's'} failed recently` });
  if (s.costAnomalies > 0) out.push({ key: 'cost', icon: 'trending-up', tone: 'warning', to: '/cost-optimization?tab=Cost Anomalies', text: `${s.costAnomalies} cost anomal${s.costAnomalies === 1 ? 'y' : 'ies'}${s.anomalyDollarImpact > 0 ? ` (~$${Math.round(s.anomalyDollarImpact).toLocaleString()} impact)` : ''}` });
  if (s.investigatingIncidents > 0) out.push({ key: 'investigations', icon: 'search', tone: 'warning', to: '/incidents?tab=Investigating', text: `${s.investigatingIncidents} investigation${s.investigatingIncidents === 1 ? '' : 's'} in progress` });
  return out;
}

export function SignalCenter({
  signals, dismissed, onDismiss, onNavigate,
}: {
  signals: ContextSignals;
  dismissed: Record<string, number>;
  onDismiss: (key: string) => void;
  onNavigate: (to: string) => void;
}) {
  const visible = useMemo(() => {
    const now = Date.now();
    return buildSignals(signals)
      .filter((sig) => !(dismissed[sig.key] && now - dismissed[sig.key] < DISMISS_TTL_MS))
      .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'critical' ? -1 : 1))
      .slice(0, 3);
  }, [signals, dismissed]);

  if (visible.length === 0) return null;

  return (
    <div className="mb-5 flex flex-col gap-2">
      {visible.map((sig) => (
        <div key={sig.key}
          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
            sig.tone === 'critical'
              ? 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
              : 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
          }`}>
          <Icon name={sig.icon} size={15} className="shrink-0" />
          <span className="flex-1 min-w-0">{sig.text}</span>
          <button type="button" onClick={() => onNavigate(sig.to)} className="shrink-0 text-xs font-semibold hover:underline">
            View →
          </button>
          <button type="button" onClick={() => onDismiss(sig.key)} aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
