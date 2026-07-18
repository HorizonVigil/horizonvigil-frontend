import { useTheme } from '../lib/theme';
import { STATUS, pick } from './charts/palette';

type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral';

const SEVERITY_TONE: Record<string, Tone> = {
  critical: 'critical', high: 'serious', medium: 'warning', low: 'good', informational: 'neutral',
  connected: 'good', active: 'good', open: 'critical', resolved: 'good', acknowledged: 'warning',
  in_progress: 'warning', pending: 'neutral', error: 'critical', expired: 'serious', disconnected: 'neutral',
  stopped: 'neutral', terminated: 'neutral', deleted: 'neutral', unknown: 'neutral',
};

/** Status pill — always icon/dot + label, never color alone (dataviz skill: status colors are reserved). */
export function Badge({ tone, children }: { tone?: Tone; label?: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const resolvedTone: Tone = tone ?? (SEVERITY_TONE[String(children).toLowerCase()] ?? 'neutral');
  const color = resolvedTone === 'neutral' ? undefined : pick(STATUS[resolvedTone], isDark);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
      {color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      {children}
    </span>
  );
}

export function severityTone(severity: string): Tone {
  return SEVERITY_TONE[severity.toLowerCase()] ?? 'neutral';
}
