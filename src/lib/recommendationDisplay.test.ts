import { describe, it, expect } from 'vitest';
import type { CostRecommendation } from './api';
import { isActionable, isUnevaluated, validityLabel, validityTone, validityExplanation, evidenceSummary, ownershipSummary, actionableSavings } from './recommendationDisplay';

function rec(over: Partial<CostRecommendation> = {}): CostRecommendation {
  return {
    id: 'r1', connection_id: 'c1', resource_id: 'res-1', category: 'rightsizing', issue: 'x', recommended_action: 'y',
    potential_monthly_savings: 6.5, priority: 'low', status: 'open', created_at: '', external_key: null,
    excluded_reason: null, excluded_justification: null, excluded_by: null, excluded_at: null, excluded_until: null,
    assigned_to: null, last_notified_at: null, last_notified_by: null,
    source: 'homegrown_heuristic', commitment_term: null, payment_option: null,
    validity: 'actionable', validity_reason: null, evidence_window_days: null, evidence_sample_count: null,
    evidence_from: null, evidence_to: null, action_group: null, target_state_at_evaluation: null,
    rule_version: null, evaluated_at: null, expires_at: null, confidence: null,
    savings_state: null, observed_monthly_savings: null, verified_at: null, ownership: null,
    ...over,
  };
}

describe('an unevaluated recommendation is never treated as sound', () => {
  it('does not count a null validity as actionable', () => {
    // Every row written before the §9 contract existed has validity null.
    // Reading that as "fine" would reinstate exactly the defect being fixed.
    expect(isActionable(rec({ validity: null }))).toBe(false);
    expect(isActionable(rec({ validity: 'unevaluated' }))).toBe(false);
  });

  it('says it has not been checked rather than that it is invalid', () => {
    expect(validityLabel(rec({ validity: null }))).toBe('Not yet checked');
    expect(validityExplanation(rec({ validity: null }))).toContain('not been checked');
  });

  it('is neutral, never green and never a warning', () => {
    expect(validityTone(rec({ validity: null }))).toBe('neutral');
  });

  it('is kept distinct from being non-actionable', () => {
    expect(isUnevaluated(rec({ validity: null }))).toBe(true);
    expect(isUnevaluated(rec({ validity: 'target_gone' }))).toBe(false);
  });
});

describe('a non-actionable recommendation', () => {
  const gone = rec({ validity: 'target_gone', validity_reason: 'The resource this recommendation refers to has been deleted.' });

  it('is never green', () => {
    expect(validityTone(gone)).toBe('warning');
  });

  it('states the recorded reason verbatim', () => {
    expect(validityExplanation(gone)).toBe('The resource this recommendation refers to has been deleted.');
  });

  it('still says something when no reason was recorded', () => {
    // An invalid row with a blank explanation reads as "no problem here".
    expect(validityExplanation(rec({ validity: 'expired', validity_reason: null }))).toContain('not currently actionable');
  });

  it('has a plain-language label for every state', () => {
    for (const v of ['actionable', 'unevaluated', 'insufficient_evidence', 'target_changed', 'target_gone', 'superseded', 'expired'] as const) {
      expect(validityLabel(rec({ validity: v }))).toMatch(/[a-z]/);
    }
  });
});

describe('evidence is described, or its absence is', () => {
  it('never leaves a missing window silently blank', () => {
    expect(evidenceSummary(rec())).toContain('No measurement window');
  });

  it('reports the window the audit found', () => {
    expect(evidenceSummary(rec({ evidence_window_days: 1, evidence_sample_count: 1 }))).toBe('Based on 1 measurement over 1 day.');
  });

  it('pluralises a real window', () => {
    expect(evidenceSummary(rec({ evidence_window_days: 30, evidence_sample_count: 30 }))).toBe('Based on 30 measurements over 30 days.');
  });
});

describe('ownership (§11)', () => {
  it('says nobody is assigned rather than showing nothing', () => {
    // Measured 2026-09-09: 0 of 515 assets have an owner. Blank space would
    // hide that; the sentence is the finding.
    const r = rec({ ownership: { owner: null, team: null, application: null } });
    expect(ownershipSummary(r)).toContain('No owner');
  });

  it('distinguishes "could not look it up" from "nobody owns it"', () => {
    expect(ownershipSummary(rec({ ownership: null }))).toContain('could not be looked up');
  });

  it('lists whatever is assigned', () => {
    const r = rec({ ownership: { owner: { value: 'ana@example.com', source: 'direct' }, team: null, application: { value: 'checkout', source: 'tag_rule' } } });
    expect(ownershipSummary(r)).toBe('Owner: ana@example.com · Application: checkout');
  });
});

describe('savings totals on the client', () => {
  it('excludes everything that is not actionable — the $8.88 becomes 0', () => {
    const production = [
      rec({ id: 'a', validity: 'target_gone', potential_monthly_savings: 6.5 }),
      rec({ id: 'b', validity: 'target_gone', potential_monthly_savings: 0.8 }),
      rec({ id: 'c', validity: 'target_gone', potential_monthly_savings: 0.8 }),
      rec({ id: 'd', validity: 'target_gone', potential_monthly_savings: 0.78 }),
    ];
    expect(actionableSavings(production)).toBe(0);
  });

  it('excludes unevaluated rows too', () => {
    expect(actionableSavings([rec({ validity: null, potential_monthly_savings: 100 })])).toBe(0);
  });

  it('sums the ones that survive', () => {
    expect(actionableSavings([rec({ potential_monthly_savings: 1.5 }), rec({ id: 'b', potential_monthly_savings: 2 })])).toBe(3.5);
  });
});
