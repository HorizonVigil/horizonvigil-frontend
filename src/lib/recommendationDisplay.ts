import type { CostRecommendation, RecommendationValidity } from './api';

/**
 * How a recommendation's validity is presented (§9).
 *
 * The four recommendations open in production on 2026-09-09 all targeted
 * soft-deleted instances, one instance carried two mutually exclusive
 * actions, and a stopped instance was being rightsized on runtime CPU. Every
 * one of them rendered as ordinary advice with an Apply button and counted
 * toward the $8.88/month the dashboard advertised as savings.
 *
 * The rule this file enforces on the client: a recommendation that is not
 * `actionable` never offers an action, and never presents its dollar figure
 * as money the customer could save.
 */

export function isActionable(r: Pick<CostRecommendation, 'validity'>): boolean {
  return r.validity === 'actionable';
}

/**
 * True only while nobody has judged the row yet.
 *
 * Kept distinct from "not actionable" throughout, because the honest thing to
 * tell someone about an unjudged recommendation is "we have not checked this
 * yet", not "this is invalid" and certainly not silence.
 */
export function isUnevaluated(r: Pick<CostRecommendation, 'validity'>): boolean {
  return r.validity === null || r.validity === 'unevaluated';
}

const LABELS: Record<RecommendationValidity, string> = {
  actionable: 'Ready to act on',
  unevaluated: 'Not yet checked',
  insufficient_evidence: 'Not enough evidence',
  target_changed: 'Resource changed',
  target_gone: 'Resource no longer exists',
  superseded: 'Superseded',
  expired: 'Evidence out of date',
};

export function validityLabel(r: Pick<CostRecommendation, 'validity'>): string {
  return LABELS[r.validity ?? 'unevaluated'];
}

/** Neutral, never `good`, for anything unproven — a green badge is a claim. */
export function validityTone(r: Pick<CostRecommendation, 'validity'>): 'good' | 'warning' | 'neutral' {
  if (r.validity === 'actionable') return 'good';
  if (isUnevaluated(r)) return 'neutral';
  return 'warning';
}

/**
 * The sentence shown under a non-actionable recommendation.
 *
 * Falls back to a stated unknown rather than an empty string: a row marked
 * invalid with no reason given is its own small dishonesty, and an empty
 * space reads as "no problem here".
 */
export function validityExplanation(r: Pick<CostRecommendation, 'validity' | 'validity_reason'>): string {
  if (r.validity_reason) return r.validity_reason;
  if (isUnevaluated(r)) return 'This recommendation has not been checked against your current resources yet.';
  return 'This recommendation is not currently actionable; no reason was recorded.';
}

/** The evidence sentence, or an explicit statement that none was recorded. */
export function evidenceSummary(r: Pick<CostRecommendation, 'evidence_window_days' | 'evidence_sample_count'>): string {
  if (r.evidence_window_days === null && r.evidence_sample_count === null) return 'No measurement window was recorded for this recommendation.';
  const days = r.evidence_window_days === null ? 'an unrecorded number of days' : `${r.evidence_window_days} day${r.evidence_window_days === 1 ? '' : 's'}`;
  const samples = r.evidence_sample_count === null ? 'an unrecorded number of measurements' : `${r.evidence_sample_count} measurement${r.evidence_sample_count === 1 ? '' : 's'}`;
  return `Based on ${samples} over ${days}.`;
}

/**
 * Ownership as one line (§11).
 *
 * Measured 2026-09-09: zero of the estate's 515 assets have an owner, so this
 * says so plainly rather than omitting the row. "Nobody is assigned" is the
 * fact worth acting on; a blank space hides it.
 */
export function ownershipSummary(r: Pick<CostRecommendation, 'ownership'>): string {
  if (r.ownership === null) return 'Ownership could not be looked up.';
  const parts = [
    r.ownership.owner && `Owner: ${r.ownership.owner.value}`,
    r.ownership.team && `Team: ${r.ownership.team.value}`,
    r.ownership.application && `Application: ${r.ownership.application.value}`,
  ].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' · ') : 'No owner, team, or application is assigned to this resource.';
}

/** Only actionable recommendations contribute to a savings total. */
export function actionableSavings(rows: readonly CostRecommendation[]): number {
  return rows.filter(isActionable).reduce((sum, r) => sum + Number(r.potential_monthly_savings || 0), 0);
}
