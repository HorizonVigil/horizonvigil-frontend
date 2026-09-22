import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/icons';
import { api, friendlyErrorMessage } from '../lib/api';
import { useOrg } from '../lib/orgContext';
import { useToast } from '../lib/toast';
import { pendingSignals, safeAdvisorHref, type AdvisorAnswer, type AdvisorDecision, type AdvisorMode, type AdvisorSignal, type AdvisorWorkspace, type DecisionStatus } from '../lib/advisor';
import { sampleAdvisorWorkspace } from '../lib/advisorSample';
import { AdvisorConversations } from './AdvisorConversations';

type View = 'overview' | 'queue' | 'advisor' | 'decisions' | 'outcomes' | 'evidence';
const VIEWS: Array<{ key: View; label: string }> = [
  { key: 'overview', label: 'Overview' }, { key: 'queue', label: 'Decision queue' },
  { key: 'advisor', label: 'Advisor' }, { key: 'decisions', label: 'Decision records' },
  { key: 'outcomes', label: 'Outcomes' }, { key: 'evidence', label: 'Evidence & coverage' },
];

function formatDate(value: string | null): string {
  if (!value) return 'Not observed';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Unknown' : date.toLocaleString();
}

function decisionFor(workspace: AdvisorWorkspace, signalId: string): AdvisorDecision | undefined {
  return workspace.decisions.find(item => item.signal_id === signalId);
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-950 dark:text-white">{value}</div>
    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</div>
  </div>;
}

function SignalCard({ signal, decision, onOpen }: { signal: AdvisorSignal; decision?: AdvisorDecision; onOpen: () => void }) {
  return <article className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700">
    <div className="flex flex-wrap items-center gap-2"><Badge>{signal.severity}</Badge><Badge>{signal.domain}</Badge><span className="text-xs text-slate-400">{signal.provider}</span>{decision && <Badge>{decision.status}</Badge>}</div>
    <h3 className="mt-3 text-base font-semibold text-slate-950 dark:text-white">{signal.title}</h3>
    <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{signal.description}</p>
    <div className="mt-4 flex items-end justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
      <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Impact</div><div className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{signal.impact}</div></div>
      <button type="button" onClick={onOpen} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-white dark:text-slate-950">Review <Icon name="arrow-right" size={15} /></button>
    </div>
  </article>;
}

function Coverage({ workspace }: { workspace: AdvisorWorkspace }) {
  return <div className="space-y-3">
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h2 className="font-semibold text-slate-950 dark:text-white">What the advisor could verify</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{workspace.coverageNote}</p></div>
    {workspace.evidence.map(item => <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3"><div><div className="font-medium text-slate-900 dark:text-white">{item.label}</div>{item.provider && <div className="mt-0.5 text-xs text-slate-400">{item.provider} evidence</div>}</div><Badge>{item.state}</Badge></div>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.summary}</p>
      {(item.capabilityState || item.freshness || item.completeness) && <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {item.capabilityState && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Capability: {item.capabilityState.replace(/_/g, ' ')}</span>}
        {item.freshness && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Freshness: {item.freshness}</span>}
        {item.completeness && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Completeness: {item.completeness.replace(/_/g, ' ')}</span>}
      </div>}
      {item.limitation && <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><Icon name="info" size={15}/><span>{item.limitation}</span></div>}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400"><span>Retrieved {formatDate(item.retrievedAt)}</span><span>Observed {formatDate(item.observedAt)}</span></div>
      {safeAdvisorHref(item.href) && <Link className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400" to={item.href}>Open source module <Icon name="arrow-up-right" size={14} /></Link>}
    </div>)}
  </div>;
}

export function AiCopilot() {
  const { currentOrg, scope } = useOrg();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const requestedView = params.get('view') as View | null;
  const view: View = VIEWS.some(item => item.key === requestedView) ? requestedView! : 'overview';
  const [workspace, setWorkspace] = useState<AdvisorWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sample, setSample] = useState(false);
  const [selected, setSelected] = useState<AdvisorSignal | null>(null);
  const [answer, setAnswer] = useState<AdvisorAnswer | null>(null);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [decisionStatus, setDecisionStatus] = useState<DecisionStatus>('approved');
  const [rationale, setRationale] = useState('');
  const [reviewAt, setReviewAt] = useState('');
  const [saving, setSaving] = useState(false);
  const scopeKey = `${currentOrg?.id ?? 'none'}:${scope?.type ?? 'org'}:${scope?.id ?? currentOrg?.id ?? 'none'}`;

  const load = useCallback(async () => {
    if (!scopeKey) return;
    setLoading(true); setError(null); setSample(false);
    try { setWorkspace(await api.getAdvisorWorkspace()); }
    catch (cause) { setWorkspace(null); setError(friendlyErrorMessage(cause, 'Advisor data could not be loaded.')); }
    finally { setLoading(false); }
  }, [scopeKey]);

  useEffect(() => { void load(); }, [load]);
  const pending = useMemo(() => workspace ? pendingSignals(workspace) : [], [workspace]);
  const critical = workspace?.signals.filter(signal => signal.severity === 'critical').length ?? 0;
  const availableEvidence = workspace?.evidence.filter(item => item.state === 'available').length ?? 0;

  function showSample() { setWorkspace(sampleAdvisorWorkspace()); setSample(true); setError(null); }
  function openSignal(signal: AdvisorSignal) { setSelected(signal); setAnswer(null); setRationale(''); setReviewAt(''); setDecisionStatus('approved'); }

  async function ask(mode: AdvisorMode) {
    if (!selected || sample) return;
    setAnswerLoading(true); setAnswer(null);
    try { setAnswer(await api.explainAdvisorSignal({ signalId: selected.id, mode })); }
    catch (cause) { toast(friendlyErrorMessage(cause, 'The advisor could not explain this signal.'), 'error'); }
    finally { setAnswerLoading(false); }
  }

  async function saveDecision() {
    if (!selected || !workspace || sample || !rationale.trim() || (decisionStatus === 'deferred' && !reviewAt)) return;
    setSaving(true);
    try {
      const record = await api.recordAdvisorDecision({ signalId: selected.id, status: decisionStatus, rationale: rationale.trim(), reviewAt: decisionStatus === 'deferred' ? new Date(reviewAt).toISOString() : null });
      setWorkspace({ ...workspace, decisions: [record, ...workspace.decisions.filter(item => item.signal_id !== record.signal_id)] });
      toast('Decision recorded with its evidence context.', 'success'); setSelected(null);
    } catch (cause) { toast(friendlyErrorMessage(cause, 'The decision could not be recorded.'), 'error'); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="space-y-4" aria-busy="true"><div className="h-40 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800"/><div className="grid gap-4 md:grid-cols-4">{[1,2,3,4].map(n => <div key={n} className="h-28 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800"/>)}</div></div>;

  if (!workspace) return <div className="space-y-4"><EmptyState icon="ai" title="Intelligence workspace unavailable" description={error ?? 'The advisor service did not return a workspace.'} action={{ label: 'View sample workspace', onClick: showSample }} /><div className="flex justify-center"><button type="button" onClick={() => void load()} className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">Try the live service again</button></div></div>;

  const visibleSignals = view === 'queue' ? pending : workspace.signals;
  return <div key={scopeKey} className="space-y-5 pb-10">
    <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 px-5 py-6 text-white shadow-lg sm:px-7">
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-brand-300"><Icon name="sparkles" size={16}/> HORIZON INTELLIGENCE V1</div><h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">Your cloud. Every decision, explained.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">A read-only decision layer over cost, security and operations. HorizonVigil brings the evidence together; your team makes the call.</p></div>
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm"><div className="text-xs uppercase tracking-wide text-slate-400">Active scope</div><div className="mt-1 font-semibold">{scope?.name ?? currentOrg?.name ?? 'Organization'}</div><div className="mt-1 text-xs text-slate-400">Updated {formatDate(workspace.retrievedAt)}</div></div></div>
    </section>
    {sample && <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><Icon name="info" size={18}/><div><strong>Sample workspace.</strong> This illustrative scenario is local to your browser and is never mixed with customer data. Decisions are disabled.</div></div>}
    <nav aria-label="Intelligence workspace" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">{VIEWS.map(item => <button key={item.key} type="button" onClick={() => setParams(item.key === 'overview' ? {} : { view: item.key })} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${view === item.key ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>{item.label}</button>)}</nav>

    {view === 'advisor' ? <AdvisorConversations /> : view === 'evidence' ? <Coverage workspace={workspace} /> : view === 'decisions' ? <div className="space-y-3">{workspace.decisions.length === 0 ? <EmptyState icon="scroll-text" title="No decisions recorded" description="Review a signal and record the team's rationale. The advisor never applies cloud changes." /> : workspace.decisions.map(item => <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-center gap-2"><Badge>{item.status}</Badge><span className="text-xs text-slate-400">{formatDate(item.created_at)}</span></div><h3 className="mt-2 font-semibold text-slate-950 dark:text-white">{item.signal_title}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.rationale}</p>{item.review_at && <p className="mt-2 text-xs text-slate-400">Review on {formatDate(item.review_at)}</p>}</div>)}</div> : view === 'outcomes' ? <EmptyState icon="chart-line" title="Outcome measurement starts after decisions" description="V1 records the human decision and evidence. Savings and risk reduction remain “not evaluated” until HorizonVigil can compare a later observation against the same signal." /> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Needs a decision" value={pending.length} detail="Open or due for review"/><Metric label="Critical" value={critical} detail="Highest urgency signals"/><Metric label="Evidence available" value={`${availableEvidence}/${workspace.evidence.length}`} detail="Sources successfully retrieved"/><Metric label="Recorded decisions" value={workspace.decisions.length} detail={workspace.decisionsAvailable ? 'Auditable team rationale' : 'Storage unavailable'} /></div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><h2 className="text-lg font-semibold text-slate-950 dark:text-white">{view === 'queue' ? 'Decision queue' : 'Priority intelligence'}</h2><p className="text-sm text-slate-500 dark:text-slate-400">Signals are derived from live module evidence in the selected scope.</p></div><div className="flex items-center gap-2 text-xs text-slate-500"><span className={`h-2 w-2 rounded-full ${workspace.model.available ? 'bg-emerald-500' : 'bg-amber-500'}`}/>{workspace.model.label}</div></div>
      {visibleSignals.length === 0 ? <EmptyState icon="check-circle" title="Queue is clear" description="There are no current signals needing a decision in this scope." /> : <div className="grid gap-4 lg:grid-cols-2">{visibleSignals.map(signal => <SignalCard key={signal.id} signal={signal} decision={decisionFor(workspace, signal.id)} onOpen={() => openSignal(signal)} />)}</div>}
    </>}

    <Drawer open={selected !== null} onClose={() => setSelected(null)} title={selected?.title ?? 'Signal review'} wide>{selected && <div className="space-y-5">
      <div className="flex flex-wrap gap-2"><Badge>{selected.severity}</Badge><Badge>{selected.domain}</Badge><Badge>{selected.provider}</Badge></div>
      <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">What was observed</div><p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{selected.description}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-400">Resource</dt><dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">{selected.resource}</dd></div><div><dt className="text-xs text-slate-400">Observed</dt><dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">{formatDate(selected.observedAt)}</dd></div></dl></div>
      <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Suggested next step</div><p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{selected.recommendation}</p></div>
      {!sample && <div><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Ask the advisor</div><div className="grid grid-cols-3 gap-2">{(['explain','verify','advise'] as AdvisorMode[]).map(mode => <button key={mode} type="button" disabled={answerLoading} onClick={() => void ask(mode)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold capitalize text-slate-700 hover:border-brand-500 hover:text-brand-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">{mode}</button>)}</div>{answerLoading && <p className="mt-3 text-sm text-slate-500">Reviewing the retrieved evidence…</p>}{answer && <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-slate-800 dark:border-brand-900 dark:bg-brand-950/30 dark:text-slate-200"><div className="mb-1 flex items-center justify-between"><strong className="capitalize">{answer.mode}</strong><span className="text-xs text-slate-400">{answer.engine}</span></div>{answer.answer}{answer.limitations.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-slate-500">{answer.limitations.map(item => <li key={item}>{item}</li>)}</ul>}</div>}</div>}
      {safeAdvisorHref(selected.sourceHref) && <Link to={selected.sourceHref} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 dark:text-brand-400">Inspect source evidence <Icon name="arrow-up-right" size={14}/></Link>}
      {!sample && workspace.decisionsAvailable && <div className="border-t border-slate-200 pt-5 dark:border-slate-800"><h3 className="font-semibold text-slate-950 dark:text-white">Record the human decision</h3><p className="mt-1 text-xs text-slate-500">This creates an audit record. It does not change any cloud resource.</p><div className="mt-3 grid grid-cols-3 gap-2">{(['approved','dismissed','deferred'] as DecisionStatus[]).map(status => <button key={status} type="button" onClick={() => setDecisionStatus(status)} className={`rounded-lg border px-2 py-2 text-xs font-semibold capitalize ${decisionStatus === status ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{status}</button>)}</div><label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">Rationale<textarea value={rationale} onChange={event => setRationale(event.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="What did the reviewer decide and why?" /></label>{decisionStatus === 'deferred' && <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">Review date<input type="datetime-local" value={reviewAt} onChange={event => setReviewAt(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>}<button type="button" onClick={() => void saveDecision()} disabled={saving || !rationale.trim() || (decisionStatus === 'deferred' && !reviewAt) || !workspace.canDecide} className="mt-3 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Recording…' : workspace.canDecide ? 'Record decision' : 'Viewer access — decisions disabled'}</button></div>}
    </div>}</Drawer>
  </div>;
}
