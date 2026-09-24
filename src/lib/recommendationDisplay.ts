import type {
  CostRecommendation,
  RecommendationValidity,
} from './api';

/**
 * Presentation and aggregation rules for cost recommendations.
 *
 * The client must treat `actionable` as the only state that can:
 * - offer an action to the user;
 * - contribute to an advertised savings total.
 *
 * Unknown, legacy, or unevaluated recommendations are fail-safe: they are not
 * presented as actionable and do not contribute to customer savings.
 */

export type ValidityTone = 'good' | 'warning' | 'neutral';

export function isActionable(
  recommendation: Pick<CostRecommendation, 'validity'>,
): boolean {
  return recommendation.validity === 'actionable';
}

/**
 * True only while the recommendation has not yet received a validity judgment.
 *
 * `null` is retained as an explicit legacy/uninitialized state because older
 * persisted rows may predate the validity contract.
 */
export function isUnevaluated(
  recommendation: Pick<CostRecommendation, 'validity'>,
): boolean {
  return (
    recommendation.validity === null ||
    recommendation.validity === 'unevaluated'
  );
}

const LABELS: Readonly<Record<RecommendationValidity, string>> = Object.freeze({
  actionable: 'Ready to act on',
  unevaluated: 'Not yet checked',
  insufficient_evidence: 'Not enough evidence',
  target_changed: 'Resource changed',
  target_gone: 'Resource no longer exists',
  superseded: 'Superseded',
  expired: 'Evidence out of date',
});

export function validityLabel(
  recommendation: Pick<CostRecommendation, 'validity'>,
): string {
  return LABELS[recommendation.validity ?? 'unevaluated'];
}

/**
 * A green tone is reserved exclusively for a server-evaluated actionable
 * recommendation. Unproven states stay neutral; known non-actionable states
 * use warning.
 */
export function validityTone(
  recommendation: Pick<CostRecommendation, 'validity'>,
): ValidityTone {
  if (recommendation.validity === 'actionable') return 'good';
  if (isUnevaluated(recommendation)) return 'neutral';
  return 'warning';
}

/**
 * Explanation shown below the validity state.
 *
 * Prefer the recorded server reason, but never render an empty explanation for
 * a known state. This keeps an invalid row from visually resembling a healthy
 * one.
 */
export function validityExplanation(
  recommendation: Pick<
    CostRecommendation,
    'validity' | 'validity_reason'
  >,
): string {
  const recordedReason = recommendation.validity_reason?.trim();

  if (recordedReason) return recordedReason;

  if (isUnevaluated(recommendation)) {
    return 'This recommendation has not been checked against your current resources yet.';
  }

  return 'This recommendation is not currently actionable; no reason was recorded.';
}

/**
 * Human-readable evidence summary.
 *
 * Missing values are stated explicitly. Invalid numeric values are never
 * allowed to leak `NaN`/`Infinity` into customer-facing copy.
 */
export function evidenceSummary(
  recommendation: Pick<
    CostRecommendation,
    'evidence_window_days' | 'evidence_sample_count'
  >,
): string {
  const { evidence_window_days: rawDays, evidence_sample_count: rawSamples } =
    recommendation;

  const days =
    typeof rawDays === 'number' && Number.isFinite(rawDays) && rawDays >= 0
      ? rawDays
      : null;

  const samples =
    typeof rawSamples === 'number' &&
    Number.isFinite(rawSamples) &&
    rawSamples >= 0
      ? rawSamples
      : null;

  if (days === null && samples === null) {
    return 'No measurement window was recorded for this recommendation.';
  }

  const dayText =
    days === null
      ? 'an unrecorded number of days'
      : `${days} day${days === 1 ? '' : 's'}`;

  const sampleText =
    samples === null
      ? 'an unrecorded number of measurements'
      : `${samples} measurement${samples === 1 ? '' : 's'}`;

  return `Based on ${sampleText} over ${dayText}.`;
}

type OwnershipField = {
  value: string;
  source: string;
};

type Ownership = {
  owner: OwnershipField | null;
  team: OwnershipField | null;
  application: OwnershipField | null;
};

/**
 * Ownership as one explicit line.
 *
 * `null` ownership means the lookup itself did not return ownership data;
 * populated-but-empty ownership means the resource was checked and no owner,
 * team, or application was assigned.
 */
export function ownershipSummary(
  recommendation: Pick<CostRecommendation, 'ownership'>,
): string {
  if (recommendation.ownership === null) {
    return 'Ownership could not be looked up.';
  }

  const ownership = recommendation.ownership as Ownership;

  const parts = [
    ownership.owner?.value?.trim()
      ? `Owner: ${ownership.owner.value.trim()}`
      : null,
    ownership.team?.value?.trim()
      ? `Team: ${ownership.team.value.trim()}`
      : null,
    ownership.application?.value?.trim()
      ? `Application: ${ownership.application.value.trim()}`
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0
    ? parts.join(' · ')
    : 'No owner, team, or application is assigned to this resource.';
}

/**
 * Only fully actionable recommendations contribute to a displayed savings
 * total. Invalid numeric savings are ignored so one malformed row cannot
 * produce NaN/Infinity for the entire dashboard.
 */
export function actionableSavings(
  rows: readonly CostRecommendation[],
): number {
  let total = 0;

  for (const recommendation of rows) {
    if (!isActionable(recommendation)) continue;

    const savings = Number(recommendation.potential_monthly_savings);

    if (!Number.isFinite(savings) || savings <= 0) {
      continue;
    }

    total += savings;
  }

  return Number.isFinite(total) ? total : 0;
}

/**
 * Defensive runtime fallback for data originating outside the typed client.
 *
 * This is intentionally not exported as a replacement for server validation;
 * it only prevents malformed persisted data from producing misleading UI.
 */
export function isKnownRecommendationValidity(
  validity: unknown,
): validity is RecommendationValidity {
  return (
    validity === 'actionable' ||
    validity === 'unevaluated' ||
    validity === 'insufficient_evidence' ||
    validity === 'target_changed' ||
    validity === 'target_gone' ||
    validity === 'superseded' ||
    validity === 'expired'
  );
}
