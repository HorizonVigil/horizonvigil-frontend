import { describe, expect, it } from 'vitest';
import type { CloudResource, CostRecommendation, RemediationRequest } from './api';
import { remediationEligibility, remediationForIssue } from './issuesRemediation';

const recommendation = (patch: Partial<CostRecommendation> = {}): CostRecommendation => ({
  id: 'rec-1', connection_id: 'conn-1', resource_id: 'row-1', category: 'idle', issue: 'Idle resource', recommended_action: 'Review',
  potential_monthly_savings: 10, priority: 'low', status: 'open', created_at: '2026-10-01T00:00:00Z', external_key: null,
  excluded_reason: null, excluded_justification: null, excluded_by: null, excluded_at: null, excluded_until: null,
  assigned_to: null, last_notified_at: null, last_notified_by: null, source: 'homegrown_heuristic', commitment_term: null,
  payment_option: null, validity: 'actionable', validity_reason: null, evidence_window_days: 14, evidence_sample_count: 14,
  evidence_from: null, evidence_to: null, action_group: null, target_state_at_evaluation: 'running', rule_version: '1',
  evaluated_at: null, expires_at: null, confidence: 0.9, savings_state: 'identified', observed_monthly_savings: null,
  verified_at: null, ownership: null, ...patch,
});

const resource = (patch: Partial<CloudResource> = {}): CloudResource => ({
  id: 'row-1', connection_id: 'conn-1', account_id: '123', resource_type_key: 'ec2_instance', resource_id: 'i-123',
  resource_name: null, region: 'us-east-1', category: 'Compute', service: 'ec2', state: 'running', status: 'active',
  is_default: false, cost_monthly: 10, tags: {}, metadata: {}, relationships: {}, first_seen_at: '', last_seen_at: '',
  deleted_at: null, created_at: '', ...patch,
});

describe('remediationEligibility', () => {
  it('offers a governed stop for an actionable running idle instance', () => {
    expect(remediationEligibility(recommendation(), resource()).action).toBe('stop_instance');
  });
  it('refuses unevaluated recommendations', () => {
    expect(remediationEligibility(recommendation({ validity: 'unevaluated' }), resource()).action).toBeNull();
  });
  it('does not invent a resize target from recommendation prose', () => {
    const result = remediationEligibility(recommendation({ category: 'rightsizing' }), resource());
    expect(result.action).toBeNull();
    expect(result.reason).toContain('structured target instance type');
  });
  it('refuses termination for an already stopped instance', () => {
    expect(remediationEligibility(recommendation(), resource({ state: 'stopped' })).reason).toContain('Termination');
  });
  it('only deletes unattached EBS volumes', () => {
    const volume = resource({ resource_type_key: 'ebs_volume', relationships: {} });
    expect(remediationEligibility(recommendation(), volume).action).toBe('delete_volume');
    expect(remediationEligibility(recommendation(), { ...volume, relationships: { attachedInstanceIds: ['i-1'] } }).action).toBeNull();
  });
});

describe('remediationForIssue', () => {
  const row = (patch: Partial<RemediationRequest>): RemediationRequest => ({
    id: 'request-1', org_id: 'org-1', connection_id: 'conn-1', resource_id: 'row-1', recommendation_id: 'rec-1',
    action_type: 'stop_instance', target_resource_id: 'i-123', region: 'us-east-1', status: 'pending_approval', requested_by: null,
    approved_by: null, dry_run_result: null, execution_result: null, rollback_of: null, target_config: null, provider: 'aws',
    created_at: '2026-10-01T00:00:00Z', approved_at: null, executed_at: null, ...patch,
  });
  it('returns only matching recommendation or resource requests newest first', () => {
    const result = remediationForIssue([
      row({ id: 'old' }), row({ id: 'new', created_at: '2026-10-02T00:00:00Z' }),
      row({ id: 'other', recommendation_id: 'other', resource_id: 'other' }),
    ], 'rec-1', 'row-1');
    expect(result.map(item => item.id)).toEqual(['new', 'old']);
  });
});
