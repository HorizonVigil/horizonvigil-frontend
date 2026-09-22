import { describe, expect, it, vi } from 'vitest';
import { pendingSignals, safeAdvisorHref } from './advisor';
import { sampleAdvisorWorkspace } from './advisorSample';

describe('advisor workspace helpers', () => {
  it('keeps undecided and due deferred signals in the queue', () => {
    vi.setSystemTime(new Date('2026-09-22T12:00:00Z'));
    const workspace = sampleAdvisorWorkspace();
    workspace.decisions = [
      { id: '1', signal_id: 'sample:compute', status: 'approved', rationale: 'Expected launch traffic.', review_at: null, created_at: '2026-09-22T10:00:00Z', actor_id: 'user-1', signal_title: 'Compute', outcome: 'not_evaluated' },
      { id: '2', signal_id: 'sample:exposure', status: 'deferred', rationale: 'Owner review pending.', review_at: '2026-09-22T11:00:00Z', created_at: '2026-09-22T10:00:00Z', actor_id: 'user-1', signal_title: 'Exposure', outcome: 'not_evaluated' },
    ];
    expect(pendingSignals(workspace).map(signal => signal.id)).toEqual(['sample:exposure', 'sample:alarm']);
    vi.useRealTimers();
  });

  it('only links to known first-party evidence routes', () => {
    expect(safeAdvisorHref('/cloud-security?tab=posture')).toBe('/cloud-security?tab=posture');
    expect(safeAdvisorHref('https://example.com')).toBeNull();
    expect(safeAdvisorHref('/cloud-security\\..\\settings')).toBeNull();
  });
});
