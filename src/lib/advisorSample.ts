import type { AdvisorWorkspace } from './advisor';

/** Opt-in illustration only. Never merged with live evidence or sent to the API. */
export function sampleAdvisorWorkspace(): AdvisorWorkspace {
  const now = new Date().toISOString();
  return {
    version: '1', provider: 'AWS', retrievedAt: now, decisionsAvailable: true, canDecide: true,
    model: { available: false, label: 'Illustrative preview' },
    governance: { provider: 'AWS', humanApprovalRequired: true, cloudMutationEnabled: false, promptVersion: 'sample', modelId: 'sample', evaluationSuite: 'sample', inferenceAuditEnabled: true, appendOnlyDecisions: true, outcomeTrackingEnabled: true },
    coverageNote: 'Sample AWS scenario: three signals across two illustrative accounts. No customer data or cloud actions.',
    decisions: [],
    evidence: [
      { id: 'cost-anomalies', domain: 'cost', label: 'Cost anomalies', state: 'available', summary: 'Sample daily compute cost change', retrievedAt: now, observedAt: now, href: '/cost-optimization' },
      { id: 'posture', domain: 'security', label: 'Cloud posture', state: 'available', summary: 'Sample configuration finding', retrievedAt: now, observedAt: now, href: '/cloud-security' },
      { id: 'alarms', domain: 'operations', label: 'Monitoring', state: 'partial', summary: 'Sample alarm with ownership not yet assigned', retrievedAt: now, observedAt: null, href: '/monitoring' },
    ],
    signals: [
      { id: 'sample:compute', title: 'Compute spend increased beyond its baseline', description: 'An illustrative compute workload is spending more than its expected daily baseline. Review the workload change before selecting an action.', domain: 'cost', severity: 'high', provider: 'AWS', connectionId: null, resource: 'production / compute', actor: null, owner: null, observedAt: now, evidenceIds: ['cost-anomalies'], recommendation: 'Compare workload demand and recent deployment changes. Confirm whether the increase is expected before considering rightsizing.', impact: 'Sample: 34% above expected daily spend', sourceHref: '/cost-optimization' },
      { id: 'sample:exposure', title: 'Review an externally accessible resource', description: 'A sample posture finding identifies a configuration that needs security review. Public access can be intentional and requires business context.', domain: 'security', severity: 'critical', provider: 'AWS', connectionId: null, resource: 'production / storage', actor: null, owner: null, observedAt: now, evidenceIds: ['posture'], recommendation: 'Confirm the intended audience, inspect access policy and assign a reviewer before changing permissions.', impact: 'Sample configuration exposure; business impact unverified', sourceHref: '/cloud-security' },
      { id: 'sample:alarm', title: 'An active alarm needs an accountable owner', description: 'An illustrative availability signal has no recorded owner. Assign responsibility and check the supporting metrics.', domain: 'operations', severity: 'medium', provider: 'AWS', connectionId: null, resource: 'staging / application', actor: null, owner: null, observedAt: null, evidenceIds: ['alarms'], recommendation: 'Inspect the alarm in monitoring and identify the responsible team. Record a decision after reviewing the current condition.', impact: 'Sample operational signal; outcome not measured', sourceHref: '/monitoring' },
    ],
  };
}
