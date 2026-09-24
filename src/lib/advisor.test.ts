import { describe, expect, it, vi } from 'vitest';
import { pendingSignals, safeAdvisorHref } from './advisor';
import { sampleAdvisorWorkspace } from './advisorSample';

describe('advisor workspace helpers', () => {
  it('keeps undecided and due deferred signals in the queue', () => {
    vi.setSystemTime(new Date('2026-09-22T12:00:00Z'));
    const workspace = sampleAdvisorWorkspace();
    workspace.decisions = [
      { id: '1', signal_id: 'sample:compute', status: 'approved', rationale: 'Expected launch traffic.', review_at: null, created_at: '2026-09-22T10:00:00Z', actor_id: 'user-1', signal_title: 'Compute', owner: 'FinOps', advisor_run_id: null, outcome: 'not_evaluated', outcome_notes: null, outcome_at: null },
      { id: '2', signal_id: 'sample:exposure', status: 'deferred', rationale: 'Owner review pending.', review_at: '2026-09-22T11:00:00Z', created_at: '2026-09-22T10:00:00Z', actor_id: 'user-1', signal_title: 'Exposure', owner: 'Security', advisor_run_id: null, outcome: 'not_evaluated', outcome_notes: null, outcome_at: null },
    ];
    expect(pendingSignals(workspace).map(signal => signal.id)).toEqual(['sample:exposure', 'sample:alarm']);
    vi.useRealTimers();
  });

  it('only links to known first-party evidence routes', () => {
    expect(safeAdvisorHref('/cloud-security?tab=posture')).toBe('/cloud-security?tab=posture');
    expect(safeAdvisorHref('/cloud-compliance')).toBe('/cloud-compliance');
    expect(safeAdvisorHref('/cloud-accounts?tab=Changes')).toBe('/cloud-accounts?tab=Changes');
    expect(safeAdvisorHref('https://example.com')).toBeNull();
    expect(safeAdvisorHref('/cloud-security\\..\\settings')).toBeNull();
  });

  it('keeps the production advisor contract AWS-only and human-controlled', () => {
    const workspace = sampleAdvisorWorkspace();
    expect(workspace.provider).toBe('AWS');
    expect(workspace.signals.every(signal => signal.provider === 'AWS')).toBe(true);
    expect(workspace.governance).toMatchObject({
      provider: 'AWS',
      humanApprovalRequired: true,
      cloudMutationEnabled: false,
      inferenceAuditEnabled: true,
      appendOnlyDecisions: true,
      outcomeTrackingEnabled: true,
    });
  });
});
