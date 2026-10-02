import type { CloudResource, CostRecommendation, RemediationActionType, RemediationRequest } from './api';

export interface RemediationEligibility {
  action: RemediationActionType | null;
  reason: string;
  targetConfig?: { targetInstanceType?: string };
}

/**
 * Maps stored inventory evidence to an action already supported by the governed
 * AWS remediation service. This deliberately refuses to infer destructive
 * actions or a resize target from prose. The connector repeats an authoritative
 * live-state and permission check during dry-run.
 */
export function remediationEligibility(
  recommendation: CostRecommendation,
  resource: CloudResource | null,
): RemediationEligibility {
  if (recommendation.validity !== 'actionable') {
    return { action: null, reason: `This recommendation is ${recommendation.validity ?? 'unevaluated'} and cannot enter remediation.` };
  }
  if (!resource) return { action: null, reason: 'Resource inventory evidence is unavailable.' };
  if (resource.deleted_at) return { action: null, reason: 'The resource is no longer live.' };

  if (resource.resource_type_key === 'ec2_instance') {
    if (recommendation.category === 'rightsizing') {
      return { action: null, reason: 'Rightsizing requires an exact structured target instance type; recommendation prose is never parsed as an execution instruction.' };
    }
    if (resource.state === 'running' && recommendation.category === 'idle') {
      return { action: 'stop_instance', reason: 'Request a governed stop. Approval and a live AWS dry-run are required before execution.' };
    }
    if (resource.state === 'stopped') {
      return { action: null, reason: 'The instance is already stopped. Termination is not an automated HorizonVigil action.' };
    }
    return { action: null, reason: `EC2 state ${resource.state ?? 'unknown'} is not eligible for an automated action.` };
  }

  if (resource.resource_type_key === 'elastic_ip') {
    return resource.relationships?.instanceId || resource.relationships?.networkInterfaceId
      ? { action: null, reason: 'The Elastic IP is attached and cannot be released automatically.' }
      : { action: 'release_eip', reason: 'Request governed release after approval and live AWS validation.' };
  }
  if (resource.resource_type_key === 'ebs_volume') {
    const attachments = (resource.relationships?.attachedInstanceIds as unknown[] | undefined ?? []).filter(Boolean);
    return attachments.length
      ? { action: null, reason: 'The EBS volume is attached and cannot be deleted automatically.' }
      : { action: 'delete_volume', reason: 'Request governed deletion after approval and live AWS validation.' };
  }
  if (resource.resource_type_key === 'ebs_snapshot') {
    return resource.state === 'completed'
      ? { action: 'delete_snapshot', reason: 'Request governed snapshot deletion after approval and live AWS validation.' }
      : { action: null, reason: 'Only completed snapshots are eligible for deletion.' };
  }
  if (resource.resource_type_key === 'ec2_ami') {
    return resource.state === 'available'
      ? { action: 'deregister_ami', reason: 'Request governed AMI deregistration after approval and live AWS validation.' }
      : { action: null, reason: 'Only available AMIs are eligible for deregistration.' };
  }
  return { action: null, reason: `Automated remediation is unsupported for ${resource.resource_type_key}.` };
}

export function remediationForIssue(
  rows: RemediationRequest[],
  recommendationId: string,
  resourceRowId: string | null,
): RemediationRequest[] {
  return rows
    .filter(row => row.recommendation_id === recommendationId || (!!resourceRowId && row.resource_id === resourceRowId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export const remediationActionLabel: Record<RemediationActionType, string> = {
  stop_instance: 'Stop instance',
  start_instance: 'Start instance',
  release_eip: 'Release Elastic IP',
  delete_volume: 'Delete volume',
  delete_snapshot: 'Delete snapshot',
  deregister_ami: 'Deregister AMI',
  resize_instance: 'Resize instance',
};
