/** Versioned contract with the independently deployed AI gateway. */
export type AdvisorDomain = 'cost' | 'security' | 'operations';
export type AdvisorMode = 'explain' | 'verify' | 'advise';
export type DecisionStatus = 'approved' | 'dismissed' | 'deferred';
export interface AdvisorEvidence {
  id: string; label: string; domain: AdvisorDomain; state: 'available' | 'partial' | 'unavailable' | 'denied';
  summary: string; retrievedAt: string; observedAt: string | null; href: string;
}
export interface AdvisorSignal {
  id: string; title: string; description: string; domain: AdvisorDomain;
  severity: 'critical' | 'high' | 'medium' | 'low'; provider: string; connectionId: string | null;
  resource: string; actor: string | null; owner: string | null; observedAt: string | null;
  evidenceIds: string[]; recommendation: string; impact: string; sourceHref: string;
}
export interface AdvisorDecision {
  id: string; signal_id: string; status: DecisionStatus; rationale: string; review_at: string | null;
  created_at: string; actor_id: string; signal_title: string; outcome: 'not_evaluated';
}
export interface AdvisorWorkspace {
  version: '1'; signals: AdvisorSignal[]; evidence: AdvisorEvidence[]; decisions: AdvisorDecision[];
  retrievedAt: string; decisionsAvailable: boolean; canDecide: boolean;
  model: { available: boolean; label: string }; coverageNote: string;
}
export interface AdvisorAnswer {
  mode: AdvisorMode; answer: string; evidenceIds: string[]; limitations: string[];
  generatedAt: string; engine: 'model' | 'evidence';
}
export function pendingSignals(workspace: AdvisorWorkspace): AdvisorSignal[] {
  return workspace.signals.filter(signal => {
    const latest = workspace.decisions.find(d => d.signal_id === signal.id);
    return !latest || (latest.status === 'deferred' && latest.review_at !== null && Date.parse(latest.review_at) <= Date.now());
  });
}
export function safeAdvisorHref(value: string): string | null {
  return /^\/(cost-management|cost-optimization|cloud-security|cloud-accounts|resources|monitoring)([/?#]|$)/.test(value) && !value.includes('\\') ? value : null;
}
