import { describe, expect, it } from 'vitest';
import type { CostRecommendation } from './api';
import {
  actionableSavings,
  evidenceSummary,
  isActionable,
  isUnevaluated,
  ownershipSummary,
  validityExplanation,
  validityLabel,
  validityTone,
} from './recommendationDisplay';

function rec(overrides: Partial<CostRecommendation> = {}): CostRecommendation {
  return {
    id: 'r1',
    connection_id: 'c1',
    resource_id: 'res-1',
    category: 'rightsizing',
    issue: 'x',
    recommended_action: 'y',
    potential_monthly_savings: 6.5,
    priority: 'low',
    status: 'open',
    created_at: '',
    external_key: null,
    excluded_reason: null,
    excluded_justification: null,
    excluded_by: null,
    excluded_at: null,
    excluded_until: null,
    assigned_to: null,
    last_notified_at: null,
    last_notified_by: null,
    source: 'homegrown_heuristic',
    commitment_term: null,
    payment_option: null,
    validity: 'actionable',
    validity_reason: null,
    evidence_window_days: null,
    evidence_sample_count: null,
    evidence_from: null,
    evidence_to: null,
    action_group: null,
    target_state_at_evaluation: null,
    rule_version: null,
    evaluated_at: null,
    expires_at: null,
    confidence: null,
    savings_state: null,
    observed_monthly_savings: null,
    verified_at: null,
    ownership: null,
    ...overrides,
  };
}

const VALIDITY_STATES = [
  'actionable',
  'unevaluated',
  'insufficient_evidence',
  'target_changed',
  'target_gone',
  'superseded',
  'expired',
] as const;

describe('unevaluated recommendations are never presented as sound', () => {
  it('does not count null validity as actionable', () => {
    expect(isActionable(rec({ validity: null }))).toBe(false);
    expect(isActionable(rec({ validity: 'unevaluated' }))).toBe(false);
  });

  it('explicitly distinguishes "not checked" from "invalid"', () => {
    const nullValidity = rec({ validity: null });
    const unevaluated = rec({ validity: 'unevaluated' });

    expect(validityLabel(nullValidity)).toBe('Not yet checked');
    expect(validityLabel(unevaluated)).toBe('Not yet checked');

    expect(validityExplanation(nullValidity)).toContain('not been checked');
    expect(validityExplanation(unevaluated)).toContain('not been checked');

    expect(validityLabel(nullValidity)).not.toMatch(/invalid|expired|gone/i);
  });

  it('uses a neutral visual tone', () => {
    expect(validityTone(rec({ validity: null }))).toBe('neutral');
    expect(validityTone(rec({ validity: 'unevaluated' }))).toBe('neutral');
  });

  it('keeps unevaluated distinct from a known non-actionable state', () => {
    expect(isUnevaluated(rec({ validity: null }))).toBe(true);
    expect(isUnevaluated(rec({ validity: 'unevaluated' }))).toBe(true);
    expect(isUnevaluated(rec({ validity: 'target_gone' }))).toBe(false);
    expect(isUnevaluated(rec({ validity: 'expired' }))).toBe(false);
  });
});

describe('non-actionable recommendations', () => {
  it('are never shown as actionable/green', () => {
    const nonActionableStates = VALIDITY_STATES.filter(
      (state) => state !== 'actionable',
    );

    for (const validity of nonActionableStates) {
      expect(
        validityTone(rec({ validity })),
        `unexpected tone for ${validity}`,
      ).not.toBe('success');
      expect(
        isActionable(rec({ validity })),
        `unexpected actionable state for ${validity}`,
      ).toBe(false);
    }
  });

  it('uses a warning tone for a known target-gone recommendation', () => {
    expect(
      validityTone(
        rec({
          validity: 'target_gone',
          validity_reason:
            'The resource this recommendation refers to has been deleted.',
        }),
      ),
    ).toBe('warning');
  });

  it('preserves a recorded validity reason verbatim', () => {
    const reason =
      'The resource this recommendation refers to has been deleted.';

    expect(
      validityExplanation(
        rec({
          validity: 'target_gone',
          validity_reason: reason,
        }),
      ),
    ).toBe(reason);
  });

  it('provides a safe fallback explanation when the recorded reason is absent', () => {
    expect(
      validityExplanation(
        rec({
          validity: 'expired',
          validity_reason: null,
        }),
      ),
    ).toContain('not currently actionable');
  });

  it('provides a non-empty plain-language label for every validity state', () => {
    for (const validity of VALIDITY_STATES) {
      expect(validityLabel(rec({ validity }))).toMatch(/[a-z]/i);
      expect(validityLabel(rec({ validity })).trim()).not.toBe('');
    }
  });

  it('keeps actionable status distinct from non-actionable states', () => {
    expect(isActionable(rec({ validity: 'actionable' }))).toBe(true);

    for (const validity of VALIDITY_STATES.filter(
      (state) => state !== 'actionable',
    )) {
      expect(isActionable(rec({ validity }))).toBe(false);
    }
  });
});

describe('evidence summaries', () => {
  it('does not silently omit a missing evidence window', () => {
    expect(evidenceSummary(rec())).toContain('No measurement window');
  });

  it('reports a singular sample/window using singular grammar', () => {
    expect(
      evidenceSummary(
        rec({
          evidence_window_days: 1,
          evidence_sample_count: 1,
        }),
      ),
    ).toBe('Based on 1 measurement over 1 day.');
  });

  it('reports plural sample/window counts correctly', () => {
    expect(
      evidenceSummary(
        rec({
          evidence_window_days: 30,
          evidence_sample_count: 30,
        }),
      ),
    ).toBe('Based on 30 measurements over 30 days.');
  });

  it('does not display NaN/Infinity for malformed evidence values', () => {
    const malformed = rec({
      evidence_window_days: Number.NaN,
      evidence_sample_count: Number.POSITIVE_INFINITY,
    });

    expect(evidenceSummary(malformed)).not.toMatch(/NaN|Infinity/i);
  });
});

describe('ownership summaries', () => {
  it('explicitly reports missing ownership', () => {
    const recommendation = rec({
      ownership: {
        owner: null,
        team: null,
        application: null,
      },
    });

    expect(ownershipSummary(recommendation)).toContain('No owner');
  });

  it('distinguishes unknown ownership from confirmed unowned assets', () => {
    expect(ownershipSummary(rec({ ownership: null }))).toContain(
      'could not be looked up',
    );
  });

  it('includes all available ownership fields without inventing values', () => {
    const recommendation = rec({
      ownership: {
        owner: {
          value: 'ana@example.com',
          source: 'direct',
        },
        team: null,
        application: {
          value: 'checkout',
          source: 'tag_rule',
        },
      },
    });

    expect(ownershipSummary(recommendation)).toBe(
      'Owner: ana@example.com · Application: checkout',
    );
  });

  it('does not output undefined/null placeholders', () => {
    const recommendation = rec({
      ownership: {
        owner: null,
        team: {
          value: 'Platform',
          source: 'direct',
        },
        application: null,
      },
    });

    const summary = ownershipSummary(recommendation);

    expect(summary).not.toMatch(/\bundefined\b|\bnull\b/i);
    expect(summary).toContain('Team: Platform');
  });
});

describe('actionable savings totals', () => {
  it('excludes every non-actionable recommendation', () => {
    const production = [
      rec({
        id: 'a',
        validity: 'target_gone',
        potential_monthly_savings: 6.5,
      }),
      rec({
        id: 'b',
        validity: 'target_gone',
        potential_monthly_savings: 0.8,
      }),
      rec({
        id: 'c',
        validity: 'expired',
        potential_monthly_savings: 0.8,
      }),
      rec({
        id: 'd',
        validity: 'unevaluated',
        potential_monthly_savings: 0.78,
      }),
    ];

    expect(actionableSavings(production)).toBe(0);
  });

  it('excludes legacy rows with null validity', () => {
    expect(
      actionableSavings([
        rec({
          validity: null,
          potential_monthly_savings: 100,
        }),
      ]),
    ).toBe(0);
  });

  it('sums only actionable recommendations', () => {
    const recommendations = [
      rec({
        id: 'a',
        validity: 'actionable',
        potential_monthly_savings: 1.5,
      }),
      rec({
        id: 'b',
        validity: 'actionable',
        potential_monthly_savings: 2,
      }),
      rec({
        id: 'c',
        validity: 'target_changed',
        potential_monthly_savings: 50,
      }),
    ];

    expect(actionableSavings(recommendations)).toBe(3.5);
  });

  it('does not let malformed numeric savings poison the total', () => {
    const recommendations = [
      rec({
        id: 'a',
        validity: 'actionable',
        potential_monthly_savings: Number.NaN,
      }),
      rec({
        id: 'b',
        validity: 'actionable',
        potential_monthly_savings: Number.POSITIVE_INFINITY,
      }),
      rec({
        id: 'c',
        validity: 'actionable',
        potential_monthly_savings: 4,
      }),
    ];

    const savings = actionableSavings(recommendations);

    expect(Number.isFinite(savings)).toBe(true);
    expect(savings).toBe(4);
  });

  it('does not mutate the recommendation collection', () => {
    const recommendations = [
      rec({
        id: 'a',
        validity: 'actionable',
        potential_monthly_savings: 1,
      }),
      rec({
        id: 'b',
        validity: 'target_gone',
        potential_monthly_savings: 2,
      }),
    ];

    const before = recommendations.map((item) => ({ ...item }));

    actionableSavings(recommendations);

    expect(recommendations).toEqual(before);
  });
});
