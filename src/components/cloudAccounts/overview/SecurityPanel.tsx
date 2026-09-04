import { useNavigate } from 'react-router-dom';
import { StackedBar } from '../../charts/StackedBar';
import { EmptyState } from '../../EmptyState';
import { SectionCard, MiniStat } from './primitives';

export interface SecurityDash {
  openFindings?: number;
  bySeverity?: Record<string, number>;
  riskScore?: number;
  remediation?: { open: number; resolved: number; suppressed: number };
}

const SEV_ORDER: { key: string; label: string; tone: 'critical' | 'serious' | 'warning' | 'good' }[] = [
  { key: 'critical', label: 'Critical', tone: 'critical' },
  { key: 'high', label: 'High', tone: 'serious' },
  { key: 'medium', label: 'Medium', tone: 'warning' },
  { key: 'low', label: 'Low', tone: 'good' },
];

/** Spec §16 — security & risk (gated on `security.read`). Severity split + open/risk figures, drills into the Security module. */
const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

export function SecurityPanel({ security }: { security: SecurityDash | null }) {
  const navigate = useNavigate();

  const bySeverity = security?.bySeverity ?? {};
  const openFindings = n(security?.openFindings);
  const riskScore = n(security?.riskScore);

  if (!security || openFindings === 0) {
    return (
      <SectionCard title="Security & Risk" icon="shield-alert" to="/vulnerability-management" linkLabel="Security">
        <EmptyState icon="shield-check" title="No open findings" description="Nothing flagged across your connected cloud resources." />
      </SectionCard>
    );
  }

  const segments = SEV_ORDER.filter((s) => n(bySeverity[s.key]) > 0).map((s) => ({
    label: s.label,
    value: n(bySeverity[s.key]),
    tone: s.tone,
  }));

  return (
    <SectionCard title="Security & Risk" icon="shield-alert" to="/vulnerability-management" linkLabel="Security">
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-6">
          <MiniStat label="Open findings" value={openFindings.toLocaleString()} tone="serious" />
          <MiniStat label="Risk score" value={String(riskScore)} tone={riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'warning' : 'good'} />
          {n(bySeverity.critical) > 0 && <MiniStat label="Critical" value={String(n(bySeverity.critical))} tone="critical" />}
        </div>
        {segments.length > 0 && (
          <StackedBar rows={[{ segments }]} height={14} onSegmentClick={(sev) => navigate(`/vulnerability-management?severity=${sev.toLowerCase()}`)} />
        )}
      </div>
    </SectionCard>
  );
}
