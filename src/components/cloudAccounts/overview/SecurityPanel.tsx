import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { StackedBar } from '../../charts/StackedBar';
import { EmptyState } from '../../EmptyState';
import { SectionCard, MiniStat } from './primitives';

export interface SecurityDash {
  openFindings?: number;
  bySeverity?: Record<string, number>;
  riskScore?: number;
  remediation?: {
    open: number;
    resolved: number;
    suppressed: number;
  };
}

type SeverityTone =
  | 'critical'
  | 'serious'
  | 'warning'
  | 'good';

interface SeverityDefinition {
  key: string;
  label: string;
  tone: SeverityTone;
}

const SEV_ORDER: readonly SeverityDefinition[] = [
  {
    key: 'critical',
    label: 'Critical',
    tone: 'critical',
  },
  {
    key: 'high',
    label: 'High',
    tone: 'serious',
  },
  {
    key: 'medium',
    label: 'Medium',
    tone: 'warning',
  },
  {
    key: 'low',
    label: 'Low',
    tone: 'good',
  },
] as const;

const DEFAULT_RISK_SCORE = 0;
const MIN_RISK_SCORE = 0;
const MAX_RISK_SCORE = 100;

function normalizeNonNegativeNumber(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return Math.max(0, value);
}

function normalizeRiskScore(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return DEFAULT_RISK_SCORE;
  }

  return Math.min(
    MAX_RISK_SCORE,
    Math.max(MIN_RISK_SCORE, value),
  );
}

function getSeverityValue(
  bySeverity: Record<string, number> | undefined,
  key: string,
): number {
  return normalizeNonNegativeNumber(
    bySeverity?.[key],
  );
}

function getRiskTone(
  riskScore: number,
): SeverityTone {
  if (riskScore >= 70) {
    return 'critical';
  }

  if (riskScore >= 40) {
    return 'warning';
  }

  return 'good';
}

function getSeverityQueryValue(
  severityKey: string,
): string {
  return encodeURIComponent(
    severityKey.trim().toLowerCase(),
  );
}

/**
 * Security & Risk dashboard panel.
 *
 * Data contract:
 * - `security === null` means security data is unavailable and must not be
 *   interpreted as a clean/zero state.
 * - Numeric values are defensively normalized at the presentation boundary.
 * - Severity values are displayed in a deterministic Critical → High →
 *   Medium → Low order.
 *
 * Authorization remains server-side. This component only presents data that
 * has already been authorized and returned by the application data layer.
 */
export function SecurityPanel({
  security,
}: {
  security: SecurityDash | null;
}) {
  const navigate = useNavigate();

  /*
   * EVERY HOOK MUST BE CALLED BEFORE THE `!security` EARLY RETURN BELOW.
   *
   * `security` is null while the dashboard loads and an object once it
   * arrives, so this component re-renders across that boundary on every page
   * load. `segments` and `handleSeverityClick` used to be declared AFTER the
   * early return, which meant they ran on the loaded render and not the
   * loading one. React compares hook counts between renders of the same
   * mounted component, so the moment security data arrived this threw
   * "Rendered more hooks than during the previous render" and took the panel
   * down. Reproduced in securityPanelHooks.test.tsx before this was moved.
   *
   * Both therefore tolerate a null `security` and are simply unused by the
   * early-return branch.
   */
  /*
   * Memoised so the null case keeps a STABLE identity. Written inline as
   * `security?.bySeverity ?? {}` it allocated a fresh object on every render,
   * which made the memo below recompute every time.
   */
  const bySeverityForSegments = useMemo(
    () => security?.bySeverity ?? {},
    [security],
  );

  const segments = useMemo(
    () =>
      SEV_ORDER
        .map((severity) => ({
          label: severity.label,
          value: getSeverityValue(
            bySeverityForSegments,
            severity.key,
          ),
          tone: severity.tone,
          key: severity.key,
        }))
        .filter((segment) => segment.value > 0),
    [bySeverityForSegments],
  );

  const handleSeverityClick = useCallback(
    (severity: string) => {
      const normalizedSeverity = String(
        severity ?? '',
      )
        .trim()
        .toLowerCase();

      if (!normalizedSeverity) {
        return;
      }

      /*
       * StackedBar currently supplies the display label
       * ("Critical", "High", ...), so convert it into the existing
       * route/query contract here.
       */
      navigate(
        `/cloud-security?tab=Misconfigurations&severity=${getSeverityQueryValue(
          normalizedSeverity,
        )}`,
      );
    },
    [navigate],
  );

  /*
   * Null is intentionally handled before any "zero findings" logic.
   *
   * A missing dashboard is not equivalent to:
   *   openFindings = 0
   *
   * This prevents the dashboard from making a false "clean" claim when the
   * source is unavailable, unauthorized, or failed.
   */
  if (!security) {
    return (
      <SectionCard
        title="Security & Risk"
        icon="shield-alert"
        to="/cloud-security"
        linkLabel="Cloud Security"
      >
        <EmptyState
          icon="shield-alert"
          title="Not available"
          description="Security findings could not be loaded for this scope. This is not a statement that nothing was found."
        />
      </SectionCard>
    );
  }

  const bySeverity = security.bySeverity ?? {};

  const openFindings = normalizeNonNegativeNumber(
    security.openFindings,
  );

  const riskScore = normalizeRiskScore(
    security.riskScore,
  );

  const criticalFindings = getSeverityValue(
    bySeverity,
    'critical',
  );

  /*
   * Prefer the explicit aggregate from the API when it is valid.
   *
   * We do not silently replace a server-provided open-findings value with a
   * client-calculated severity sum because future finding categories may not
   * be represented by this four-item dashboard split.
   */
  const hasSeverityData = SEV_ORDER.some(
    ({ key }) => getSeverityValue(bySeverity, key) > 0,
  );

  const riskTone = getRiskTone(riskScore);

  /*
   * Genuine zero findings.
   *
   * This branch is reached only after `security` itself has been loaded.
   */
  if (openFindings === 0) {
    return (
      <SectionCard
        title="Security & Risk"
        icon="shield-alert"
        to="/cloud-security"
        linkLabel="Cloud Security"
      >
        <EmptyState
          icon="shield-check"
          title="No open findings"
          description="No open security findings were reported for this scope."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Security & Risk"
      icon="shield-alert"
      to="/cloud-security"
      linkLabel="Cloud Security"
    >
      <div className="flex flex-col gap-4">
        <div
          className="flex flex-wrap items-end gap-x-6 gap-y-4"
          aria-label="Security summary"
        >
          <MiniStat
            label="Open findings"
            value={openFindings.toLocaleString()}
            tone="serious"
          />

          <MiniStat
            label="Risk score"
            value={riskScore.toLocaleString()}
            tone={riskTone}
          />

          {criticalFindings > 0 && (
            <MiniStat
              label="Critical"
              value={criticalFindings.toLocaleString()}
              tone="critical"
            />
          )}
        </div>

        {hasSeverityData && segments.length > 0 ? (
          <div
            aria-label="Open findings by severity"
            className="min-w-0"
          >
            <StackedBar
              rows={[
                {
                  segments,
                },
              ]}
              height={14}
              onSegmentClick={handleSeverityClick}
            />
          </div>
        ) : (
          /*
           * Do not imply that the severity distribution is zero merely
           * because the aggregate open finding count is non-zero.
           */
          <p
            role="status"
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            Severity breakdown is not available for the current findings.
          </p>
        )}
      </div>
    </SectionCard>
  );
}