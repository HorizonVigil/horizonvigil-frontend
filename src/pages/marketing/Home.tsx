import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { MARKETING_PLANS, formatPrice, CONTACT_SALES_HREF, BOOK_DEMO_HREF } from '../../lib/marketingContent';
import { scrollToSection } from '../../lib/scrollToSection';

const MODULES = [
  { name: 'Cloud Accounts', desc: 'Connect AWS accounts and GCP projects once — access-key, cross-account role, or service-account impersonation, your choice.' },
  { name: 'Resources & Containers', desc: 'A live, searchable inventory across EC2, S3, RDS, Compute Engine, Cloud Storage, Cloud SQL, Cloud Run, and Artifact Registry.' },
  { name: 'Cost Management', desc: 'Real spend data with anomaly detection, broken down by account and service — not just a bill you scroll through.' },
  { name: 'Cost Optimization', desc: 'Specific savings recommendations with an exclusion workflow for what\'s intentional, plus one-click and Auto-PR remediation via your connected GitHub repos.' },
  { name: 'Cloud Security', desc: 'Posture, misconfigurations, exposure, and identity risk across every connected account, plus provider-native compliance evidence — not an independent framework certification.' },
  { name: 'Issues', desc: 'Cost, security, and alert items that need attention, unified into one list — instead of checking three modules to know what\'s outstanding.' },
  { name: 'Clusters', desc: 'EKS and GKE in one view — workloads, node health, and cluster-level issues alongside everything else.' },
  { name: 'Monitoring & Alerts', desc: 'Resource-level metrics and alerting that already knows which account and org a resource belongs to.' },
  { name: 'Automation', desc: 'One-click remediation — stop/start, right-sizing, and policy-driven fixes with a full audit trail. Every action starts from an explicit click today.' },
  { name: 'Reports & Dashboards', desc: 'Custom dashboards and one-time report generation built from the same data your team already sees day to day.' },
  { name: 'Users & RBAC', desc: 'Org-scoped roles down to the individual account — the same access model backing every module above.' },
];

const PROVIDERS = [
  { name: 'AWS', services: ['EC2', 'S3', 'RDS', 'EKS', 'IAM', 'CloudTrail', 'Cost Explorer'] },
  { name: 'Google Cloud', services: ['Compute Engine', 'Cloud Storage', 'Cloud SQL', 'GKE', 'Cloud Run', 'Artifact Registry'] },
];

const BENEFITS = [
  { stat: 'One', label: 'login for every cloud account you manage, instead of N separate consoles.' },
  { stat: 'Minutes', label: 'from connecting an account to seeing its full resource inventory.' },
  { stat: 'Automatic', label: 'cost anomaly detection and savings recommendations, surfaced without a query.' },
  { stat: 'Every action', label: 'audit-logged — who ran what remediation, on which resource, and when.' },
];

const AI_FEATURES = [
  { title: 'Cost anomaly detection', desc: 'Spend that breaks from an account\'s own baseline is flagged automatically, before it shows up as a surprise on the bill.' },
  { title: 'Savings recommendations', desc: 'Idle and oversized resources are surfaced with a specific, actionable fix — not a generic "reduce costs" tip.' },
  { title: 'Finding prioritization', desc: 'Vulnerability and misconfiguration findings are ranked by real exposure, so triage starts with what actually matters.' },
  { title: 'Remediation suggestions', desc: 'Common fixes (stop an idle instance, tighten a security group) are proposed inline, one click from being applied.' },
];

// Deliberately not claiming CIS/PCI DSS/ISO 27001/SOC 2/HIPAA as live scored
// frameworks -- verified 2026-09-08 that compliance_benchmarks (the table
// backing GET /api/vulnerability-management/compliance, which does have real
// framework columns for cis_aws_foundations/pci_dss/iso_27001) has zero rows
// in production for any framework, ever. The real, live compliance signal
// today is AWS Config's own rule/conformance-pack evaluation (see
// connector-aws's awsConfigFindings.ts / config.ts) -- this section now
// describes that instead of a capability that has never produced a result.
const COMPLIANCE_BENCHMARKS = [
  { name: 'AWS Config rules', desc: 'Pass/fail evaluation from the AWS Config rules you already have running in your account, surfaced without a separate console.' },
  { name: 'Conformance packs', desc: 'Conformance pack results (often CIS- or PCI-aligned managed rule sets you\'ve enabled in AWS Config) show up as findings alongside everything else.' },
  { name: 'More frameworks', desc: 'Independent CIS, PCI DSS, ISO 27001, and SOC 2 scoring — not dependent on what you\'ve already configured in AWS Config — is on the roadmap, not live yet.' },
];

const SECURITY_FEATURES = [
  { title: 'Credentials encrypted at rest', desc: 'AWS keys and GCP service-account keys are AES-GCM encrypted before they ever touch storage, with a fresh IV per record.' },
  { title: 'Org-scoped RBAC', desc: 'Every role grant is scoped to an organization and, where it matters, to a single cloud account — not a blanket admin toggle.' },
  { title: 'Full audit log', desc: 'Every write — connecting an account, running a remediation, changing a role — is recorded with who, what, and when.' },
  { title: 'Rate-limited by design', desc: 'API abuse protection is enforced atomically at the database layer, consistent across every instance of every service.' },
  { title: 'AWS Config compliance', desc: 'Real pass/fail results from the AWS Config rules and conformance packs already running in your account — not a separate, independent CIS/SOC 2/ISO 27001/HIPAA scoring engine, which isn\'t live yet.' },
  { title: 'SSO / SAML', desc: 'Single sign-on on Professional and above; full SAML SSO on Business and Enterprise.' },
];

const FAQS = [
  { q: 'Which clouds does HorizonVigil support today?', a: 'AWS and Google Cloud, both with real, live scanning — not a roadmap promise. Azure support is built but not yet available in production while we finish its deployment pipeline; we\'d rather ship it fully working than half-connected.' },
  { q: 'How does account access work?', a: 'For AWS, connect via a scoped access key or a cross-account IAM role — no long-lived key required if you use the role. For GCP, connect via a service-account key or service-account impersonation.' },
  { q: 'Is there a free plan?', a: 'Yes. Free connects one cloud account for two users, with 7-day data retention — enough to see real value before you pay anything.' },
  { q: 'Can I cancel or change plans anytime?', a: 'Yes, from the in-app billing portal. Downgrades and cancellations take effect at the end of your current billing period; there\'s no lock-in contract below Enterprise.' },
  { q: 'What happens to my data if I downgrade?', a: 'Nothing is deleted. Your resource inventory and history stay intact — only your data-retention window and included limits change to match the new plan.' },
  { q: 'Do you offer annual billing?', a: 'Yes — every paid plan has an annual price roughly 20% below paying monthly, shown on the pricing page.' },
];

// Real, honest 5-stage product workflow -- every sentence traces to a real,
// shipped capability (matches Docs.tsx / MODULES / AI_FEATURES wording
// exactly). Deliberately does NOT borrow the "governed autonomy ladder"
// framing from larger vision documents (simulate/approve/execute/rollback
// stages) -- that policy-approval workflow doesn't exist in the product;
// remediation today is an explicit one-click action, which is what stage 4
// actually says.
const HOW_IT_WORKS = [
  { stage: 'Connect', desc: 'Link an AWS account or GCP project with a scoped access key, a cross-account IAM role, or service-account impersonation. Read-only by default — automation is a separate, explicit opt-in.' },
  { stage: 'Discover', desc: 'A live, searchable inventory builds automatically across every connected account — EC2, S3, RDS, Compute Engine, Cloud SQL, GKE, Artifact Registry, and more.' },
  { stage: 'Detect', desc: 'Cost anomalies, misconfigurations, and exposure are surfaced automatically and ranked by real impact — not a raw feed you sort through yourself.' },
  { stage: 'Remediate', desc: 'Apply a fix in one click, or open an Auto-PR against a connected GitHub repo for changes your team would rather review first.' },
  { stage: 'Audit', desc: 'Every action — who ran it, on what resource, and when — is logged automatically, with no separate compliance tool to bolt on.' },
];

// Each role links to real modules only -- no per-role marketing route exists
// today, so the "learn more" destinations are the actual in-app module names
// (matched against MODULES above) rather than invented solution pages.
const ROLES = [
  {
    role: 'FinOps & Finance',
    job: 'Move from an unexplained bill to spend you can actually act on.',
    links: ['Cost Management', 'Cost Optimization'],
  },
  {
    role: 'Security & Compliance',
    job: 'Triage what\'s actually exposed, not a raw finding feed.',
    links: ['Cloud Security', 'Resources & Containers'],
  },
  {
    role: 'Platform & DevOps',
    job: 'See workload health next to everything else that affects it.',
    links: ['Clusters', 'Automation'],
  },
  {
    role: 'Executive & Leadership',
    job: 'One place to know what\'s running, what it costs, and what\'s at risk.',
    links: ['Reports & Dashboards', 'Issues'],
  },
];

function Section({ id, className = '', children }: { id?: string; className?: string; children: React.ReactNode }) {
  return <section id={id} className={`max-w-6xl mx-auto px-5 py-20 ${className}`}>{children}</section>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-3">{children}</div>;
}

export function MarketingHome() {
  const { hash } = useLocation();

  // Covers loading /#security directly, and navigating in from a different
  // page (e.g. the footer's Security link while on /pricing) -- Home mounts
  // fresh with the hash already present. Does NOT handle a click while
  // already on "/": MarketingNav/MarketingFooter intercept that case
  // directly via scrollToSection, since relying on this hash-watching
  // effect for a same-pathname hash-only change turned out to be exactly
  // the case that didn't reliably fire.
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    const raf = requestAnimationFrame(() => { scrollToSection(id); });
    return () => cancelAnimationFrame(raf);
  }, [hash]);

  return (
    <div className="bg-white dark:bg-slate-950">
      <MarketingNav />
      <Hero />
      <TrustBar />
      <ProblemTransition />
      <HowItWorks />
      <ProductOverview />
      <PlatformCapabilities />
      <RoleSelector />
      <CloudProviders />
      <ArchitectureOverview />
      <AICapabilities />
      <SecurityCompliance />
      <ComplianceBenchmarks />
      <DocsPreview />
      <ProductPreview />
      <PricingTeaser />
      <CustomerBenefits />
      <FAQ />
      <FinalCTA />
      <MarketingFooter />
    </div>
  );
}

function Hero() {
  // Illustrative sequence only -- same "Illustrative" convention ProductPreview
  // already uses further down this page. Every row names a real module
  // (Cloud Accounts, Resources, Cost Management, Cloud Security, Automation);
  // the numbers themselves are example figures, not a live feed.
  const glimpse = [
    { label: '3 accounts connected', tone: 'neutral' as const },
    { label: '1,204 resources discovered', tone: 'neutral' as const },
    { label: 'Cost anomaly: +34% in us-east-1', tone: 'warn' as const },
    { label: '12 findings prioritized by exposure', tone: 'warn' as const },
    { label: 'Remediation applied — audit logged', tone: 'good' as const },
  ];
  const toneClass: Record<'neutral' | 'warn' | 'good', string> = {
    neutral: 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300',
    warn: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
    good: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300',
  };

  return (
    <Section className="pt-20 pb-16">
      <div className="grid lg:grid-cols-[1fr_minmax(0,20rem)] gap-12 items-start">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-4">
            AWS + Google Cloud, one login
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            One control plane for every AWS and GCP account you run.
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 mt-6 max-w-xl text-balance">
            Inventory, cost, security, and automated remediation — unified across every cloud account your team owns, without stitching together five different consoles.
          </p>
          <div className="flex items-center gap-3 mt-8 flex-wrap">
            <Link to="/signup" className="text-sm font-semibold px-6 py-3 rounded-md bg-brand-600 hover:bg-brand-700 text-white">
              Start free — no credit card
            </Link>
            <a href={BOOK_DEMO_HREF} className="text-sm font-semibold px-6 py-3 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900">
              Book a demo
            </a>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
            Start on the free plan today. Add automation, SSO, and higher retention as your team grows.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shrink-0 w-full">
          <div className="h-9 flex items-center px-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Illustrative example</span>
          </div>
          <div className="p-3 flex flex-col gap-2">
            {glimpse.map(g => (
              <div key={g.label} className={`text-xs font-medium rounded-md px-3 py-2.5 ${toneClass[g.tone]}`}>{g.label}</div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function TrustBar() {
  // 'SOC 2 mapped' removed 2026-09-08 -- verified no such mapping exists
  // anywhere in the product (see SECURITY_FEATURES and COMPLIANCE_BENCHMARKS
  // comments below for the full finding). Full audit log is real (writeAuditLog
  // is used pervasively, confirmed live in Overview's own Recent Activity feed).
  const items = ['AWS', 'Google Cloud', 'EKS', 'GKE', 'AES-256 encryption', 'Full audit log'];
  return (
    <div className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
      <div className="max-w-6xl mx-auto px-5 py-6 flex items-center justify-center gap-x-8 gap-y-3 flex-wrap text-sm font-medium text-slate-500 dark:text-slate-400">
        {items.map(i => <span key={i}>{i}</span>)}
      </div>
    </div>
  );
}

/**
 * Names the real fragmentation problem before the product enters the
 * narrative — every statement here is the same real pain the FAQ and
 * CustomerBenefits sections already describe individually, just placed
 * up front as a short editorial transition instead of only appearing later.
 */
function ProblemTransition() {
  return (
    <Section className="!py-16">
      <div className="grid md:grid-cols-[1fr_1fr] gap-10 items-start border-t border-slate-200 dark:border-slate-800 pt-16">
        <p className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white text-balance leading-snug">
          Cost lives in a bill. Security lives in a different console. Ops finds out last.
        </p>
        <div className="flex flex-col gap-4">
          <div className="border-l-2 border-slate-200 dark:border-slate-700 pl-4 text-sm text-slate-600 dark:text-slate-300">
            Finance sees a monthly total, not which resource caused the spike.
          </div>
          <div className="border-l-2 border-slate-200 dark:border-slate-700 pl-4 text-sm text-slate-600 dark:text-slate-300">
            Security sees a raw finding feed, not what's actually exposed.
          </div>
          <div className="border-l-2 border-slate-200 dark:border-slate-700 pl-4 text-sm text-slate-600 dark:text-slate-300">
            Ops finds out when something breaks — not before.
          </div>
          <button
            onClick={() => scrollToSection('how-it-works')}
            className="text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline text-left mt-1"
          >
            See how HorizonVigil connects all three →
          </button>
        </div>
      </div>
    </Section>
  );
}

function HowItWorks() {
  const [active, setActive] = useState(0);
  return (
    <Section id="how-it-works" className="bg-slate-50 dark:bg-slate-900/30 !max-w-none">
      <div className="max-w-6xl mx-auto px-5">
        <div className="max-w-2xl mb-10">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-balance">From connected account to audited fix, in five real steps.</h2>
        </div>
        <div role="tablist" aria-label="How it works" className="flex flex-wrap gap-2 mb-6">
          {HOW_IT_WORKS.map((s, i) => (
            <button
              key={s.stage}
              role="tab"
              aria-selected={active === i}
              onClick={() => setActive(i)}
              className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors ${
                active === i
                  ? 'bg-brand-600 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="opacity-60 mr-1.5">{i + 1}</span>{s.stage}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 max-w-3xl">
          <p className="text-base text-slate-700 dark:text-slate-200 leading-relaxed">{HOW_IT_WORKS[active].desc}</p>
        </div>
      </div>
    </Section>
  );
}

function ProductOverview() {
  return (
    <Section>
      <div className="grid lg:grid-cols-[minmax(0,22rem)_1fr] gap-10 items-start">
        <div>
          <Eyebrow>Product overview</Eyebrow>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-balance">Everything your cloud ops team checks daily, in one place.</h2>
          <p className="text-slate-600 dark:text-slate-300 mt-4">
            HorizonVigil connects directly to your AWS accounts and GCP projects, builds a live inventory, and layers cost, security, and automation on top — so the answer to "what's running, what does it cost, and is it safe" is always one login away.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6 content-start">
          {BENEFITS.map(b => (
            <div key={b.label}>
              <div className="text-3xl font-bold text-brand-600 dark:text-brand-400 mb-2">{b.stat}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function PlatformCapabilities() {
  return (
    <Section id="platform" className="bg-slate-50 dark:bg-slate-900/30 !max-w-none">
      <div className="max-w-6xl mx-auto px-5">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Eyebrow>Platform capabilities</Eyebrow>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Eleven modules. One data model.</h2>
          <p className="text-slate-600 dark:text-slate-300 mt-4">Every module reads from the same connected accounts and the same org-scoped permissions — connect once, see everything.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {MODULES.map(m => (
            <div key={m.name} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">{m.name}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/**
 * Every "learn more" destination below names a real MODULES entry rather
 * than a per-role marketing route (none exist yet) -- deliberately kept as
 * plain text call-outs, not links to pages that don't exist.
 */
function RoleSelector() {
  const [active, setActive] = useState(0);
  return (
    <Section>
      <div className="max-w-2xl mb-10">
        <Eyebrow>Built for how your team works</Eyebrow>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-balance">Same data, a different starting view for each role.</h2>
      </div>
      <div className="grid md:grid-cols-[14rem_1fr] gap-6">
        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible">
          {ROLES.map((r, i) => (
            <button
              key={r.role}
              onClick={() => setActive(i)}
              aria-current={active === i}
              className={`text-sm font-semibold text-left px-4 py-3 rounded-md whitespace-nowrap md:whitespace-normal shrink-0 ${
                active === i
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
            >
              {r.role}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <p className="text-base font-medium text-slate-900 dark:text-white mb-4">{ROLES[active].job}</p>
          <div className="flex flex-wrap gap-2">
            {ROLES[active].links.map(l => (
              <span key={l} className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{l}</span>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function CloudProviders() {
  return (
    <Section>
      <div className="text-center max-w-2xl mx-auto mb-14">
        <Eyebrow>Supported cloud providers</Eyebrow>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Real scanners, not a roadmap slide.</h2>
        <p className="text-slate-600 dark:text-slate-300 mt-4">Azure support is built but not yet available in production — we're not listing it as connectable here until its deployment is finished.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-6">
        {PROVIDERS.map(p => (
          <div key={p.name} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{p.name}</div>
            <div className="flex flex-wrap gap-2">
              {p.services.map(s => (
                <span key={s} className="text-xs font-medium px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ArchitectureOverview() {
  const stages = [
    { title: 'Your cloud accounts', desc: 'AWS accounts & GCP projects' },
    { title: 'Scoped connectors', desc: 'Access key, IAM role, or service-account impersonation — least privilege' },
    { title: 'Unified data layer', desc: 'Org-scoped, RLS-protected Postgres' },
    { title: 'Dashboards, alerts & automation', desc: 'What you actually interact with' },
  ];
  return (
    <Section className="bg-slate-50 dark:bg-slate-900/30 !max-w-none">
      <div className="max-w-6xl mx-auto px-5">
        <div className="max-w-2xl mb-14">
          <Eyebrow>Architecture overview</Eyebrow>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">How data gets from your accounts to your screen.</h2>
        </div>
        <div className="flex flex-col md:flex-row items-stretch gap-3">
          {stages.map((s, i) => (
            <div key={s.title} className="flex items-center gap-3 flex-1">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex-1 h-full">
                <div className="text-xs font-semibold text-brand-600 dark:text-brand-400 mb-1">Step {i + 1}</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{s.title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{s.desc}</div>
              </div>
              {i < stages.length - 1 && (
                <div className="hidden md:block text-slate-300 dark:text-slate-700 text-xl shrink-0">→</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function AICapabilities() {
  return (
    <Section>
      <div className="text-center max-w-2xl mx-auto mb-14">
        <Eyebrow>AI capabilities</Eyebrow>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Automated intelligence, not just automation.</h2>
        <p className="text-slate-600 dark:text-slate-300 mt-4">A rules-and-signal engine runs continuously across your connected accounts, turning raw resource and cost data into specific, actionable findings.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        {AI_FEATURES.map(f => (
          <div key={f.title} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">{f.title}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function SecurityCompliance() {
  return (
    <Section id="security" className="bg-slate-50 dark:bg-slate-900/30 !max-w-none">
      <div className="max-w-6xl mx-auto px-5">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Eyebrow>Security & compliance</Eyebrow>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Built to be trusted with account access.</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SECURITY_FEATURES.map(f => (
            <div key={f.title} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">{f.title}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/**
 * Distinct from SecurityCompliance above: that section covers AWS Config
 * compliance signal (rules/conformance packs). This section is about
 * breadth of independent framework support -- what's real today (AWS
 * Config-derived) and what's roadmap (CIS/PCI DSS/ISO 27001/SOC 2 scored
 * independently of a customer's own AWS Config setup). Both sections point
 * at the same underlying honesty: compliance_benchmarks (the table with real
 * cis_aws_foundations/pci_dss/iso_27001 framework columns, read by
 * GET /api/vulnerability-management/compliance) has zero rows in production
 * for any framework as of 2026-09-08 -- nothing populates it yet. Don't
 * restate the old "live scoring" claim until something actually writes to
 * that table.
 */
function ComplianceBenchmarks() {
  return (
    <Section>
      <div className="text-center max-w-2xl mx-auto mb-14">
        <Eyebrow>Compliance</Eyebrow>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Real signal from AWS Config, today.</h2>
        <p className="text-slate-600 dark:text-slate-300 mt-4">Every connected AWS account's Config rules and conformance packs are surfaced as findings you can see at any time — under Vulnerability Management › Compliance. Independent framework scoring is on the roadmap.</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-5">
        {COMPLIANCE_BENCHMARKS.map(b => (
          <div key={b.name} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">{b.name}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{b.desc}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/**
 * Excerpt wording mirrors Docs.tsx's own real setup copy exactly (steps 2-3
 * of the getting-started guide) -- not a separate, invented description of
 * the connection flow. No code sample is shown here since account
 * connection is a UI flow, not an API call a visitor would copy.
 */
function DocsPreview() {
  return (
    <Section className="bg-slate-50 dark:bg-slate-900/30 !max-w-none">
      <div className="max-w-6xl mx-auto px-5">
        <div className="grid lg:grid-cols-[1fr_minmax(0,18rem)] gap-10 items-center">
          <div>
            <Eyebrow>Documentation</Eyebrow>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-balance">Technical detail, before you sign up.</h2>
            <p className="text-slate-600 dark:text-slate-300 mt-4 max-w-xl">
              Connect an AWS account with a scoped access key or a cross-account IAM role — no long-lived key required if you use the role. Connect a GCP project with a service-account key or service-account impersonation. Either way, HorizonVigil only requests read access unless you separately enable automation.
            </p>
          </div>
          <div className="flex lg:justify-end">
            <Link to="/docs" className="text-sm font-semibold px-6 py-3 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 whitespace-nowrap">
              Read the docs →
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}

function ProductPreview() {
  const panels = [
    { label: 'Cost Management', rows: ['Monthly spend by account', 'Anomaly: +34% in us-east-1', '3 savings recommendations'] },
    { label: 'Vulnerability Management', rows: ['12 critical findings', 'Deduped from 4 accounts', 'Prioritized by exposure'] },
    { label: 'Resources', rows: ['1,204 resources tracked', 'Across 8 connected accounts', 'AWS + GCP, one view'] },
  ];
  return (
    <Section>
      <div className="text-center max-w-2xl mx-auto mb-14">
        <Eyebrow>See it in action</Eyebrow>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">A look at the real interface.</h2>
        <p className="text-slate-600 dark:text-slate-300 mt-4">Illustrative previews of live modules — connect an account to see your own data in the same views.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {panels.map(p => (
          <div key={p.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="h-9 flex items-center gap-1.5 px-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{p.label}</span>
            </div>
            <div className="p-4 flex flex-col gap-2.5">
              {p.rows.map(r => (
                <div key={r} className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-md px-3 py-2.5">{r}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function PricingTeaser() {
  return (
    <Section className="bg-slate-50 dark:bg-slate-900/30 !max-w-none">
      <div className="max-w-6xl mx-auto px-5">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Simple, transparent, and includes a real free plan.</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {MARKETING_PLANS.map(p => (
            <div key={p.key} className={`rounded-xl border p-5 flex flex-col bg-white dark:bg-slate-900 ${p.highlighted ? 'border-brand-600 ring-1 ring-brand-600' : 'border-slate-200 dark:border-slate-800'}`}>
              <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{p.name}</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                {formatPrice(p.monthlyCents, p.key)}
                {p.key !== 'enterprise' && <span className="text-xs font-normal text-slate-400">/mo</span>}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex-grow">{p.cloudAccounts} accounts · {p.users} users</div>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link to="/pricing" className="text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline">See full plan comparison →</Link>
        </div>
      </div>
    </Section>
  );
}

function CustomerBenefits() {
  const items = [
    { title: 'Stop tab-switching between consoles', desc: 'One login replaces separate logins to the AWS console, GCP console, and whatever spreadsheet was tracking cost.' },
    { title: 'Catch cost problems same-day', desc: 'Anomaly detection flags unusual spend before it becomes an unpleasant surprise at month-end.' },
    { title: 'Faster security triage', desc: 'Findings arrive deduplicated and prioritized, not as a raw feed someone has to manually sort.' },
    { title: 'Audit-ready by default', desc: 'Every remediation and role change is logged automatically — no separate compliance tooling to bolt on.' },
  ];
  return (
    <Section>
      <div className="max-w-2xl mb-14">
        <Eyebrow>Why teams switch</Eyebrow>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Fewer tools, faster answers.</h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-6">
        {items.map(i => (
          <div key={i.title} className="flex gap-4">
            <div className="h-8 w-8 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold text-sm shrink-0">✓</div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{i.title}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{i.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <Section className="max-w-3xl">
      <div className="text-center mb-14">
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Questions people actually ask</h2>
      </div>
      <div className="flex flex-col gap-3">
        {FAQS.map((f, i) => {
          const isOpen = openIdx === i;
          return (
            <div key={f.q} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <button
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{f.q}</span>
                <span className={`text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-45' : ''}`}>+</span>
              </button>
              {isOpen && <div className="px-5 pb-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.a}</div>}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function FinalCTA() {
  return (
    <Section className="text-center pb-24">
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-balance">Connect your first account in the next five minutes.</h2>
      <p className="text-slate-600 dark:text-slate-300 mt-4 max-w-lg mx-auto">Free plan, no credit card. Cancel anytime.</p>
      <div className="flex items-center justify-center gap-3 mt-8 flex-wrap">
        <Link to="/signup" className="text-sm font-semibold px-6 py-3 rounded-md bg-brand-600 hover:bg-brand-700 text-white">Start free</Link>
        <a href={CONTACT_SALES_HREF} className="text-sm font-semibold px-6 py-3 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900">Talk to sales</a>
      </div>
    </Section>
  );
}
