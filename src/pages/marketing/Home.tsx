import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { BOOK_DEMO_HREF, CONTACT_SALES_HREF, MARKETING_PLANS, formatPrice } from '../../lib/marketingContent';
import { scrollToSection } from '../../lib/scrollToSection';

const DECISION_STAGES = [
  { number: '01', title: 'Explain', description: 'Turn a cost spike, exposure, or operational change into a plain-language explanation with the affected resources and likely cause.' },
  { number: '02', title: 'Verify', description: 'Check the recommendation against live inventory, provider evidence, ownership, and the scope your role is allowed to see.' },
  { number: '03', title: 'Advise', description: 'Compare practical next steps, expected impact, and risk before your team chooses what should happen.' },
  { number: '04', title: 'Record', description: 'Keep the evidence, human decision, owner, and outcome together so the reasoning remains reviewable later.' },
];

const PLATFORM_PILLARS = [
  { title: 'FinOps', metric: 'Spend → decision', description: 'Explain anomalies, identify the resources behind them, and turn savings opportunities into owned decisions.', bullets: ['Cost allocation and trends', 'Anomaly investigation', 'Evidence-backed optimization'] },
  { title: 'Security', metric: 'Finding → priority', description: 'Connect posture, exposure, identity, and provider-native evidence so teams can prioritize what is actually risky.', bullets: ['Cloud posture and exposure', 'Resource-level evidence', 'Provider-native signals'] },
  { title: 'Operations', metric: 'Signal → owner', description: 'See resources, clusters, monitoring, alerts, and change context in the same operating picture.', bullets: ['Multi-account inventory', 'Cluster and workload health', 'Monitoring and alert context'] },
  { title: 'Governance', metric: 'Decision → record', description: 'Keep access scoped, changes deliberate, and every product write attributable to a person and time.', bullets: ['Organization-scoped RBAC', 'Human approval by design', 'Auditable decision history'] },
];

const PROVIDERS = [
  { name: 'AWS', detail: 'Inventory, cost, security, clusters, monitoring, and provider-native evidence.' },
  { name: 'Google Cloud', detail: 'Projects, resources, cost, GKE, Cloud Run, Artifact Registry, and operational context.' },
  { name: 'Azure', detail: 'A dedicated connector and workspace are rolling out through the V1 delivery plan.' },
];

const FAQS = [
  { question: 'What is Horizon Intelligence?', answer: 'It is the decision layer inside HorizonVigil. It brings together cloud evidence, explains what changed, verifies the supporting data, advises the next step, and keeps the human decision attached to the outcome.' },
  { question: 'Does HorizonVigil make changes in my cloud?', answer: 'No. V1 connects read-only and keeps a human in control. It can prepare guidance, commands, or a reviewable handoff, but it does not silently mutate cloud resources.' },
  { question: 'Which providers are available?', answer: 'AWS and Google Cloud are the established production paths. Azure has its own connector and workspace and is being rolled out through the V1 plan. Provider coverage remains explicit so a configured integration is never mistaken for collected evidence.' },
  { question: 'Can I start without a sales call?', answer: 'Yes. The Free plan connects one cloud account for two users. Paid plans add account scale, users, automation capacity, retention, and support.' },
];

function Section({ id, className = '', children }: { id?: string; className?: string; children: React.ReactNode }) {
  return <section id={id} className={`mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:px-8 ${className}`}>{children}</section>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">{children}</p>;
}

export function MarketingHome() {
  const { hash } = useLocation();

  useEffect(() => {
    document.title = 'HorizonVigil — AI Cloud Decision Intelligence';
    const description = 'HorizonVigil turns cloud cost, security, and operational signals into explained, verified, human-governed decisions across AWS, Google Cloud, and Azure.';
    let meta = document.querySelector<HTMLMetaElement>('meta[name=description]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, []);

  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    window.setTimeout(() => scrollToSection(id), 0);
  }, [hash]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-white">
      <MarketingNav />
      <main id="main-content">
        <Hero />
        <TrustBar />
        <DecisionIntelligence />
        <Platform />
        <DecisionWorkspace />
        <Coverage />
        <Security />
        <PricingTeaser />
        <FAQ />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </div>
  );
}

function Hero() {
  const decisions = [
    ['Critical', 'Public access changed on production storage', 'Security · AWS · 8 min ago', 'bg-rose-400'],
    ['High', 'Compute spend is 34% above its baseline', 'FinOps · Google Cloud · 21 min ago', 'bg-amber-400'],
    ['Medium', 'Production alarm has no assigned owner', 'Operations · AWS · 1 hr ago', 'bg-sky-400'],
  ];
  return (
    <section className="relative isolate overflow-hidden border-b border-slate-200 bg-slate-950 text-white dark:border-slate-800">
      <div className="absolute inset-0 -z-10 opacity-70" aria-hidden="true">
        <div className="absolute left-[-12rem] top-[-8rem] h-[32rem] w-[32rem] rounded-full bg-brand-600/25 blur-3xl" />
        <div className="absolute bottom-[-14rem] right-[-8rem] h-[30rem] w-[30rem] rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.06)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-28">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />AI cloud decision intelligence
          </div>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Turn cloud signals into governed decisions.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">HorizonVigil unifies cost, security, operations, and change evidence. Horizon Intelligence explains what changed, verifies the evidence, and advises the next step. Your team decides.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup" className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/30 transition hover:bg-brand-500">Start free</Link>
            <a href="/#intelligence" className="rounded-lg border border-slate-600 bg-slate-900/60 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-400 hover:bg-slate-800">See how Intelligence works</a>
            <a href={BOOK_DEMO_HREF} className="px-3 py-3 text-sm font-semibold text-slate-300 transition hover:text-white">Book a demo →</a>
          </div>
          <p className="mt-5 text-xs text-slate-500">Read-only by default · Human approval · Decision history</p>
        </div>
        <div className="relative" aria-label="Illustrative Horizon Intelligence decision queue">
          <div className="absolute -inset-5 rounded-[2rem] bg-brand-500/10 blur-2xl" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div><p className="text-xs font-semibold text-white">Decision queue</p><p className="mt-0.5 text-[11px] text-slate-500">Prioritized across your cloud estate</p></div>
              <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">Evidence current</span>
            </div>
            <div className="space-y-3 p-4">
              {decisions.map(([severity, title, meta, color]) => (
                <div key={title} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><span className={`h-1.5 w-1.5 rounded-full ${color}`} />{severity}</p><p className="mt-2 text-sm font-medium leading-5 text-slate-100">{title}</p><p className="mt-1 text-[11px] text-slate-500">{meta}</p></div>
                    <span className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-[10px] font-medium text-slate-300">Review</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-800 bg-slate-950/50 px-5 py-3 text-[10px] text-slate-500">Illustrative product view</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  return <div id="coverage" className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50"><div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-y divide-slate-200 px-5 sm:px-6 md:grid-cols-4 md:divide-y-0 lg:px-8 dark:divide-slate-800">
    {[
      ['AWS + GCP', 'Production cloud paths'], ['Azure', 'Dedicated V1 connector'], ['101', 'Registered AWS service scanners'], ['Read-only', 'Default connection model'],
    ].map(([value, label]) => <div key={value} className="px-5 py-6 text-center"><p className="text-lg font-semibold text-slate-900 dark:text-white">{value}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</p></div>)}
  </div></div>;
}

function DecisionIntelligence() {
  return <Section id="intelligence"><div className="mx-auto max-w-3xl text-center"><Eyebrow>Horizon Intelligence</Eyebrow><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">A decision system, not another stream of findings.</h2><p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">Every recommendation follows the same reviewable path. Teams get the context to act with confidence while people retain control of the decision.</p></div>
    <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{DECISION_STAGES.map(stage => <article key={stage.title} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-brand-600 dark:text-brand-400">{stage.number}</span><span className="h-px w-10 bg-slate-200 transition-all group-hover:w-16 group-hover:bg-brand-400 dark:bg-slate-700" /></div><h3 className="mt-8 text-xl font-semibold">{stage.title}</h3><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{stage.description}</p></article>)}</div>
  </Section>;
}

function Platform() {
  return <div className="border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40"><Section id="platform"><div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-end"><div><Eyebrow>One operating picture</Eyebrow><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Four disciplines. One evidence model.</h2></div><p className="max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 lg:justify-self-end">HorizonVigil connects the cost, risk, operational health, and ownership of the same resource. The advisor can reason across that context instead of treating every signal as an isolated alert.</p></div>
    <div className="mt-12 grid gap-4 md:grid-cols-2">{PLATFORM_PILLARS.map(pillar => <article key={pillar.title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center justify-between gap-3"><h3 className="text-xl font-semibold">{pillar.title}</h3><span className="rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">{pillar.metric}</span></div><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{pillar.description}</p><ul className="mt-5 grid gap-2 sm:grid-cols-3">{pillar.bullets.map(bullet => <li key={bullet} className="flex items-start gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-500" />{bullet}</li>)}</ul></article>)}</div>
  </Section></div>;
}

function DecisionWorkspace() {
  const steps = [['Explain', 'Policy changed outside the expected deployment window.'], ['Verify', 'Public read is active; owner and change event identified.'], ['Advise', 'Restrict access after confirming the public endpoint dependency.']];
  return <Section><div className="grid gap-12 lg:grid-cols-2 lg:items-center"><div><Eyebrow>Built into daily work</Eyebrow><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Start with the queue. Ask the advisor. Keep the evidence.</h2><p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">The signed-in workspace prioritizes decisions across the cloud estate. Open any item to review evidence, discuss it with the advisor, assign an owner, and retain the decision record. Supported changes can be handed off as exact commands or a reviewable Auto-PR.</p><div className="mt-7 flex flex-wrap gap-3"><Link to="/signup" className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">Open your workspace</Link><Link to="/docs" className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">Read the docs</Link></div></div>
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-950"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-wider text-rose-500">Security decision</p><h3 className="mt-2 font-semibold">Restrict public access to production storage?</h3></div><span className="rounded-md bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">Critical</span></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{steps.map(([label, copy]) => <div key={label} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">{label}</p><p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-400">{copy}</p></div>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800"><p className="text-xs text-slate-500">Owner: Platform Security · Evidence: 6 sources</p><span className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">Review decision</span></div></div></div>
  </div></Section>;
}

function Coverage() {
  return <div className="border-y border-slate-200 bg-slate-950 text-white dark:border-slate-800"><Section><div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><Eyebrow>Cloud coverage</Eyebrow><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">A separate provider path. A shared decision layer.</h2><p className="mt-4 text-sm leading-6 text-slate-400">Each cloud keeps its native account, resource, cost, and security model. Horizon Intelligence normalizes the evidence needed to explain and govern a decision.</p></div><div className="grid gap-3">{PROVIDERS.map((provider, index) => <div key={provider.name} className="flex gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-xs font-bold text-brand-300">0{index + 1}</span><div><h3 className="font-semibold">{provider.name}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{provider.detail}</p></div></div>)}</div></div></Section></div>;
}

function Security() {
  return <Section id="security"><div className="mx-auto max-w-3xl text-center"><Eyebrow>Control stays with your team</Eyebrow><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Intelligence your team can inspect.</h2><p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">Recommendations are grounded in the evidence available to the signed-in user. Missing coverage stays visible, and the final action remains a human decision.</p></div><div className="mt-12 grid gap-4 md:grid-cols-3">{[
    ['Read-only by default', 'Connect cloud evidence without giving HorizonVigil broad mutation rights.'], ['Role-scoped context', 'Organization and account permissions determine what each person and advisor session can access.'], ['Reviewable history', 'Keep administrative writes and decision context attributable for later review.'],
  ].map(([title, copy]) => <article key={title} className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-lg text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">✓</div><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{copy}</p></article>)}</div></Section>;
}

function PricingTeaser() {
  return <div className="border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40"><Section id="pricing"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><Eyebrow>Pricing</Eyebrow><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Start with visibility. Scale with your team.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">Choose by cloud-account scale, users, automation capacity, retention, and support. Annual billing saves roughly 20%.</p></div><Link to="/pricing" className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">Compare every plan →</Link></div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{MARKETING_PLANS.map(plan => <article key={plan.key} className={`flex flex-col rounded-2xl border bg-white p-5 dark:bg-slate-950 ${plan.highlighted ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200 dark:border-slate-800'}`}>{plan.highlighted && <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">Most popular</p>}<h3 className="font-semibold">{plan.name}</h3><p className="mt-3 text-3xl font-bold tabular-nums">{formatPrice(plan.monthlyCents, plan.key)}{plan.key !== 'enterprise' && <span className="text-xs font-normal text-slate-400">/mo</span>}</p><p className="mt-3 flex-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{plan.tagline}</p><p className="mt-5 text-xs font-medium text-slate-700 dark:text-slate-300">{plan.cloudAccounts} cloud account{plan.cloudAccounts === '1' ? '' : 's'} · {plan.users} users</p></article>)}</div></Section></div>;
}

function FAQ() {
  return <Section><div className="grid gap-10 lg:grid-cols-[.55fr_1.45fr]"><div><Eyebrow>Questions</Eyebrow><h2 className="text-3xl font-bold tracking-tight">Understand the operating model.</h2></div><div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">{FAQS.map(faq => <details key={faq.question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{faq.question}<span className="text-brand-600 transition group-open:rotate-45 dark:text-brand-400">+</span></summary><p className="mt-3 max-w-3xl pr-8 text-sm leading-6 text-slate-600 dark:text-slate-400">{faq.answer}</p></details>)}</div></div></Section>;
}

function FinalCTA() {
  return <Section className="pt-0"><div className="overflow-hidden rounded-3xl bg-brand-600 px-6 py-12 text-center text-white shadow-xl shadow-brand-900/20 sm:px-12"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-100">Your next cloud decision starts here</p><h2 className="mx-auto mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">See what changed, why it matters, and what to do next.</h2><div className="mt-8 flex flex-wrap justify-center gap-3"><Link to="/signup" className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">Start free</Link><a href={CONTACT_SALES_HREF} className="rounded-lg border border-brand-300/70 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-500">Talk to sales</a></div></div></Section>;
}
