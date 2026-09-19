import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { MARKETING_PLANS, formatPrice, CONTACT_SALES_HREF, BOOK_DEMO_HREF } from '../../lib/marketingContent';
import { scrollToSection } from '../../lib/scrollToSection';

const MODULES = [
  { name: 'Cloud Accounts', desc: 'Connect AWS accounts and GCP projects once. AWS uses an access key today; cross-account role support is built but not yet certified, so it stays switched off.' },
  { name: 'Resources & Containers', desc: 'A live, searchable inventory across EC2, S3, RDS, Compute Engine, Cloud Storage, Cloud SQL, Cloud Run, and Artifact Registry.' },
  { name: 'Cost Management', desc: 'Real spend data with anomaly detection, broken down by account and service — not just a bill you scroll through.' },
  { name: 'Cost Optimization', desc: 'Savings recommendations that show the evidence behind them, with an exclusion workflow for what\'s intentional. HorizonVigil never changes your cloud for you — it gives you the exact commands, or opens an Auto-PR against a connected GitHub repo.' },
  { name: 'Cloud Security', desc: 'Posture, misconfigurations, exposure, and identity risk across every connected account, plus provider-native compliance evidence — not an independent framework certification.' },
  { name: 'Issues', desc: 'Cost, security, and alert items that need attention, unified into one list — instead of checking three modules to know what\'s outstanding.' },
  { name: 'Clusters', desc: 'EKS and GKE in one view — workloads, node health, and cluster-level issues alongside everything else.' },
  { name: 'Monitoring & Alerts', desc: 'Resource-level metrics and alerting that already knows which account and org a resource belongs to.' },
  { name: 'Automation', desc: 'Scheduled jobs and policy rules with a full audit trail. HorizonVigil connects read-only and does not execute changes in your cloud — actions are handed off as commands, tickets, or a pull request you review.' },
  { name: 'Reports & Dashboards', desc: 'Custom dashboards and one-time report generation built from the same data your team already sees day to day.' },
  { name: 'Users & RBAC', desc: 'Org-scoped roles down to the individual account — the same access model backing every module above.' },
];

const PROVIDERS = [
  { name: 'AWS', services: ['EC2', 'S3', 'RDS', 'EKS', 'IAM', 'CloudTrail', 'Cost Explorer'] },
  { name: 'Google Cloud', services: ['Compute Engine', 'Cloud Storage', 'Cloud SQL', 'GKE', 'Cloud Run', 'Artifact Registry'] },
];

const BENEFITS = [
  { stat: 'One', label: 'login for every cloud account you manage, instead of N separate consoles.' },
  { stat: 'Automated', label: 'resource discovery across connected accounts and regions.' },
  { stat: 'Automatic', label: 'cost anomaly detection and savings recommendations, surfaced without a query.' },
  { stat: 'Every write', label: 'audit-logged — who changed what in HorizonVigil and when.' },
];

const AI_FEATURES = [
  { title: 'Cost anomaly detection', desc: 'Spend that breaks from an account\'s own baseline is flagged automatically, before it shows up as a surprise on the bill.' },
  { title: 'Savings recommendations', desc: 'Idle and oversized resources are surfaced with a specific, actionable fix — not a generic "reduce costs" tip.' },
  { title: 'Finding prioritization', desc: 'Vulnerability and misconfiguration findings are ranked by real exposure, so triage starts with what actually matters.' },
  { title: 'Remediation suggestions', desc: 'Common fixes (stop an idle instance, tighten a security group) are proposed inline with the exact commands to run — HorizonVigil does not apply them for you.' },
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
  { title: 'Credentials encrypted at rest', desc: 'AWS keys and GCP service-account credentials are encrypted before storage, using authenticated encryption with a fresh IV per record.' },
  { title: 'Org-scoped RBAC', desc: 'Every role grant is scoped to an organization and, where it matters, to a single cloud account — not a blanket admin toggle.' },
  { title: 'Full audit log', desc: 'Every write — connecting an account, running a remediation, changing a role — is recorded with who, what, and when.' },
  { title: 'Rate-limited by design', desc: 'API abuse protection is enforced atomically at the database layer, consistent across every instance of every service.' },
  { title: 'AWS Config compliance', desc: 'Real pass/fail results from the AWS Config rules and conformance packs already running in your account — not a separate, independent CIS/SOC 2/ISO 27001/HIPAA scoring engine, which isn\'t live yet.' },
  { title: 'SSO / SAML', desc: 'Single sign-on on Professional and above; full SAML SSO on Business and Enterprise.' },
];

const FAQS = [
  { q: 'Which clouds does HorizonVigil support today?', a: 'AWS and Google Cloud, both with real, live scanning — not a roadmap promise. Azure support is built but not yet available in production while we finish its deployment pipeline; we\'d rather ship it fully working than half-connected.' },
  { q: 'How does account access work?', a: 'For AWS, connect via a scoped read-only access key. Cross-account IAM role support is built but not yet certified, so it is switched off until it is. For GCP, connect via a service-account key or service-account impersonation.' },
  { q: 'Is there a free plan?', a: 'Yes. Free connects one cloud account for two users, with 7-day data retention — enough to see real value before you pay anything.' },
  { q: 'Can I cancel or change plans anytime?', a: 'Yes, from the in-app billing portal. Downgrades and cancellations take effect at the end of your current billing period; there\'s no lock-in contract below Enterprise.' },
  { q: 'What happens to my data if I downgrade?', a: 'Nothing is deleted. Your resource inventory and history stay intact — only your data-retention window and included limits change to match the new plan.' },
  { q: 'Do you offer annual billing?', a: 'Yes — every paid plan has an annual price roughly 20% below paying monthly, shown on the pricing page.' },
];

// Real, honest 5-stage product workflow -- every sentence traces to a real,
// shipped capability (matches Docs.tsx / MODULES / AI_FEATURES wording
// exactly). Deliberately does NOT borrow the "governed autonomy ladder"
// framing from larger vision documents (simulate/approve/execute/rollback
// stages) -- that policy-approval workflow doesn't exist in the product.
// Nor does remediation: provider mutation is server-denied in V1 (every
// remediation endpoint returns 403), so stage 4 is a hand-off, not an
// action. This comment previously said "remediation today is an explicit
// one-click action" and was the justification for the copy above it --
// both were describing a capability the server refuses.
const HOW_IT_WORKS = [
  { stage: 'Connect', desc: 'Link an AWS account with a scoped access key, or a GCP project with service-account impersonation. Read-only — HorizonVigil never gets write access to your cloud.' },
  { stage: 'Discover', desc: 'A live, searchable inventory builds automatically across every connected account — EC2, S3, RDS, Compute Engine, Cloud SQL, GKE, Artifact Registry, and more.' },
  { stage: 'Detect', desc: 'Cost anomalies, misconfigurations, and exposure are surfaced automatically and ranked by real impact — not a raw feed you sort through yourself.' },
  { stage: 'Hand off', desc: 'Take the exact commands to run yourself, or open an Auto-PR against a connected GitHub repo. HorizonVigil does not make the change for you.' },
  { stage: 'Audit', desc: 'Every HorizonVigil write — account connections, role changes, and other administrative actions — is logged automatically.' },
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
/**
 * Coverage facts for the hero trust row and the stat band.
 *
 * Every number here is checkable against the shipped connector rather than
 * estimated: REGIONAL_SCANNERS (88) + GLOBAL_SCANNERS (13) = 101 registered AWS
 * service scanners in horizonvigil-connector-aws/src/routes/discovery.ts. If
 * that registry changes, this copy has to change with it — the numbers are a
 * claim about the product, so they live next to the code that makes them true
 * rather than being rounded up for effect.
 */
const COVERAGE_FACTS = [
  { value: '101', label: 'AWS service scanners registered and running today.' },
  { value: '2', label: 'Clouds live in production — AWS and Google Cloud.' },
  { value: 'Read-only', label: 'Access requested by default. No write permission needed to start.' },
  { value: '11', label: 'Modules sharing one org-scoped data model and one permission set.' },
];

/**
 * The DevSecOps suite — NOT AVAILABLE YET, and described that way throughout.
 *
 * Every capability below has user-interface code in this repository, but none
 * of it is reachable: src/routes/lazyRoutes.manifest.ts lists the pages the
 * router actually mounts, and these are absent from it. That is the whole
 * reason they are rendered as a separate, explicitly-labelled roadmap rather
 * than folded into the module grid above — a visitor must not be able to read
 * "vulnerability findings" as something they can go and use today, because the
 * module count the rest of this page claims (eleven) deliberately excludes
 * them.
 *
 * `status` values are blunt on purpose. 'In development' means the scanning
 * work exists in some form but is not wired up end to end; 'Planned' means
 * there is nothing to turn on yet.
 */
const DEVSECOPS_ROADMAP: {
  name: string;
  status: 'In development' | 'Planned';
  desc: string;
  tags: string[];
}[] = [
  {
    name: 'Vulnerability findings',
    status: 'In development',
    desc: 'Container, code, and dependency results collected into one findings queue per org — de-duplicated across repeated scans so a weekly re-scan updates a finding instead of adding another copy of it.',
    tags: ['Image scanning', 'SCA', 'De-duplication'],
  },
  {
    name: 'Application & code security',
    status: 'In development',
    desc: 'Static analysis, dependency, and hardcoded-secret checks run against connected repositories, reported next to the cloud resources they belong to.',
    tags: ['SAST', 'Dependencies', 'Secret detection'],
  },
  {
    name: 'Container & Kubernetes security',
    status: 'In development',
    desc: 'Image-layer and cluster-hardening checks, attached to the EKS and GKE clusters already inventoried in the Clusters module.',
    tags: ['Cluster hardening', 'Image layers'],
  },
  {
    name: 'Infrastructure security',
    status: 'Planned',
    desc: 'Cloud posture and network-exposure checks, plus drift between what is deployed and what the IaC says should be.',
    tags: ['Posture', 'Exposure', 'IaC drift'],
  },
  {
    name: 'Scan scheduling & history',
    status: 'Planned',
    desc: 'Per-scanner scheduling, coverage status, and run history — so a scanner that did not run is visibly different from a scanner that ran and found nothing.',
    tags: ['Scheduling', 'Coverage status'],
  },
  {
    name: 'Source inventory',
    status: 'Planned',
    desc: 'Repositories, build artefacts, and images tracked alongside cloud resources, so a finding can be traced from a running container back to the commit that produced it.',
    tags: ['Repositories', 'Artefacts', 'Traceability'],
  },
];

/**
 * A neutral comparison against how this is usually done today.
 *
 * Deliberately not a named-competitor table: nothing here asserts anything
 * about a third party's product, only about the two approaches every cloud team
 * has already tried — logging into each provider's own console, and stitching
 * exports together in a spreadsheet. Statements about HorizonVigil are limited
 * to the capabilities described elsewhere on this page.
 */
const COMPARISON_ROWS = [
  { label: 'One login across every account and provider', consoles: false, spreadsheet: false, hv: true },
  { label: 'Cross-region resource inventory collected automatically', consoles: false, spreadsheet: false, hv: true },
  { label: 'Which resource caused a cost change', consoles: false, spreadsheet: false, hv: true },
  { label: 'Findings linked to the resource that caused them', consoles: false, spreadsheet: false, hv: true },
  { label: 'Role scoped to a single account, not a blanket admin toggle', consoles: false, spreadsheet: false, hv: true },
  { label: 'Audit log of who changed what inside the tool', consoles: false, spreadsheet: false, hv: true },
  { label: 'Read-only access by default', consoles: true, spreadsheet: true, hv: true },
];


function Section({ id, className = '', children }: { id?: string; className?: string; children: React.ReactNode }) {
  return <section id={id} className={`max-w-6xl mx-auto px-5 py-20 ${className}`}>{children}</section>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-3">{children}</div>;
}

export function MarketingHome() {
  const { hash } = useLocation();

  useEffect(() => {
    document.title = 'HorizonVigil — Cloud Operations, FinOps & Security';
    const description = 'HorizonVigil gives teams one control plane for cloud inventory, cost, security, and guided remediation across connected cloud accounts.';
    let meta = document.querySelector<HTMLMetaElement>('meta[name=description]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, []);

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
      <CoverageBand />
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
      <DevSecOpsRoadmap />
      <ComparisonTable />
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
    { label: '6 misconfigurations found', tone: 'warn' as const },
    { label: 'Fix handed off — audit logged', tone: 'good' as const },
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
            Inventory, cost, security, and guided remediation — unified across every cloud account your team owns, without stitching together five different consoles.
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
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-6 text-xs text-slate-500 dark:text-slate-400">
            <li className="flex items-center gap-1.5">
              <span className="text-emerald-500" aria-hidden="true">✓</span>
              No credit card required
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-emerald-500" aria-hidden="true">✓</span>
              Read-only access by default
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-emerald-500" aria-hidden="true">✓</span>
              101 AWS service scanners
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-emerald-500" aria-hidden="true">✓</span>
              Cancel anytime
            </li>
          </ul>
          <button
            type="button"
            onClick={() => scrollToSection('platform')}
            className="text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline mt-6"
          >
            See everything it covers →
          </button>
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
  const items = ['AWS', 'Google Cloud', 'EKS', 'GKE', 'Encrypted credentials', 'Full audit log'];
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
              aria-controls={`how-it-works-panel-${i}`}
              id={`how-it-works-tab-${i}`}
              tabIndex={active === i ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') setActive((i + 1) % HOW_IT_WORKS.length);
                if (e.key === 'ArrowLeft') setActive((i - 1 + HOW_IT_WORKS.length) % HOW_IT_WORKS.length);
              }}
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
        <div role="tabpanel" id={`how-it-works-panel-${active}`} aria-labelledby={`how-it-works-tab-${active}`} tabIndex={0} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 max-w-3xl">
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
              type="button"
              key={r.role}
              aria-pressed={active === i}
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
        <p className="text-slate-600 dark:text-slate-300 mt-4">A rules-and-signal engine runs automatically across your connected accounts, turning raw resource and cost data into specific, actionable findings.</p>
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
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Provider-native compliance evidence.</h2>
        <p className="text-slate-600 dark:text-slate-300 mt-4">If you enable AWS Config with a conformance pack, its rule results are collected as control evidence under Cloud Compliance — each with the scope, the exact check, and when it was observed. Until Config is recording, the module says so rather than showing a score. Provider checks are not an independent framework certification.</p>
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
              Connect an AWS account with a scoped, read-only access key. Cross-account IAM role support is built but not yet certified, so it stays switched off until it is. Connect a GCP project with a service-account key or service-account impersonation. Either way, HorizonVigil only requests read access unless you separately enable automation.
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
    { label: 'Cloud Security', rows: ['Misconfigurations by account', 'Externally shared resources', 'Identity & access risk'] },
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
                type="button"
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
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-balance">Connect your first account and start exploring your cloud.</h2>
      <p className="text-slate-600 dark:text-slate-300 mt-4 max-w-lg mx-auto">Free plan, no credit card. Cancel anytime.</p>
      <div className="flex items-center justify-center gap-3 mt-8 flex-wrap">
        <Link to="/signup" className="text-sm font-semibold px-6 py-3 rounded-md bg-brand-600 hover:bg-brand-700 text-white">Start free</Link>
        <a href={CONTACT_SALES_HREF} className="text-sm font-semibold px-6 py-3 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900">Talk to sales</a>
      </div>
    </Section>
  );
}
/**
 * The verifiable-coverage band.
 *
 * Placed immediately after the hero because the first question a platform lead
 * asks is "how much of my estate does this actually see?" — and the honest
 * answer is a scanner count plus a plain statement of what is read-only, not a
 * percentage with nothing behind it. Numbers come from COVERAGE_FACTS, which is
 * tied to the connector's own scanner registry (see its comment).
 */
function CoverageBand() {
  return (
    <Section id="coverage" className="bg-slate-50 dark:bg-slate-900/30 !max-w-none">
      <div className="max-w-6xl mx-auto px-5">
        <div className="max-w-2xl mb-12">
          <Eyebrow>Coverage, in numbers</Eyebrow>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-balance">
            How much of your cloud it actually reads.
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mt-4">
            Coverage is the part of a cloud tool worth checking first, so these are counts rather than adjectives.
            Each figure below is measured against the connector that runs in production today.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {COVERAGE_FACTS.map(f => (
            <div key={f.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="text-3xl font-bold text-brand-600 dark:text-brand-400 mb-2">{f.value}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{f.label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-6 max-w-2xl">
          Scan intervals and regions are configured per account at connect time. Connecting an account reads its
          inventory and cost data — it does not modify anything in it.
        </p>
      </div>
    </Section>
  );
}

/**
 * The DevSecOps roadmap.
 *
 * Rendered as its own section, styled as clearly not-yet-available (dashed
 * borders, muted status pills, an explicit "not available yet" badge), because
 * these are the capabilities most likely to be misread as shipping. They are
 * all absent from src/routes/lazyRoutes.manifest.ts, so this describes work in
 * progress rather than a feature list.
 *
 * The visual distinction is deliberate and load-bearing: every claim on the
 * rest of this page is about something a visitor can use today, and mixing
 * these into the module grid would quietly break that.
 */
function DevSecOpsRoadmap() {
  return (
    <Section id="devsecops" className="!max-w-none border-y border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/20">
      <div className="max-w-6xl mx-auto px-5">
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Coming soon — not available yet
            </span>
          </div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-balance">
            The DevSecOps suite, in development.
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mt-4">
            Vulnerability findings, application and code security, container and Kubernetes security, and
            infrastructure security are being built on the same inventory and identity model as the modules above —
            so a finding can name the account, the resource, and the owner without a second integration.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
            None of the items below can be used today. They are listed so you know what is coming and can tell us
            what matters most — not because they are ready.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {DEVSECOPS_ROADMAP.map(item => (
            <div
              key={item.name}
              className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.name}</div>
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {item.status}
                </span>
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-3">{item.desc}</div>
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map(t => (
                  <span key={t} className="text-[11px] font-medium px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <a
            href={CONTACT_SALES_HREF}
            className="text-sm font-semibold px-5 py-2.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900"
          >
            Tell us what to build first
          </a>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            We would rather ship these fully working than half-connected.
          </span>
        </div>
      </div>
    </Section>
  );
}

/**
 * The comparison section.
 *
 * Compares against the two approaches teams actually use today — per-provider
 * consoles, and exported cost data in a spreadsheet — rather than against a
 * named competitor. Nothing here asserts anything about another company's
 * product, which is both the honest framing and the one that stays true when
 * their feature sets change.
 *
 * A "no" in the console or spreadsheet column is not a criticism of those
 * tools; it is the specific reason a team ends up looking for something else.
 * The one row those approaches do win (read-only access) is shown as a tie on
 * purpose — a table where the product wins every row is not a comparison.
 */
function ComparisonTable() {
  const columnClass = 'text-center px-4 py-3 text-sm';
  return (
    <Section id="why">
      <div className="max-w-2xl mb-12">
        <Eyebrow>Why not just use the consoles</Eyebrow>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-balance">
          The consoles are not the problem. Not talking to each other is.
        </h2>
        <p className="text-slate-600 dark:text-slate-300 mt-4">
          Most teams already own a monitoring tool, a cost dashboard, and a security scanner. The gap is that none of
          them can answer "which resource, in which account, changed what" — so the work lands on someone to
          reconcile by hand.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[36rem] border-collapse">
          <caption className="sr-only">
            Comparison of per-provider consoles, manual spreadsheets, and HorizonVigil across common cloud
            operations tasks.
          </caption>
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
              <th scope="col" className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Task
              </th>
              <th scope="col" className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Provider consoles
              </th>
              <th scope="col" className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Manual spreadsheets
              </th>
              <th scope="col" className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                HorizonVigil
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map(row => (
              <tr key={row.label} className="border-b border-slate-100 dark:border-slate-800/60 last:border-b-0">
                <th scope="row" className="text-left px-4 py-3 text-sm font-normal text-slate-700 dark:text-slate-200">
                  {row.label}
                </th>
                {[row.consoles, row.spreadsheet, row.hv].map((ok, i) => (
                  <td key={i} className={columnClass}>
                    <span
                      className={ok
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-300 dark:text-slate-600'}
                    >
                      {ok ? '✓' : '—'}
                    </span>
                    <span className="sr-only">{ok ? 'Yes' : 'No'}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-4 max-w-2xl">
        Provider consoles and spreadsheets are read-only by nature, and so is HorizonVigil by default — that row is a
        tie, not a win. Where it differs is having one place where the same resource carries its account, its cost,
        and its security context together.
      </p>
    </Section>
  );
}