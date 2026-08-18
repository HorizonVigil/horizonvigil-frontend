import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { MARKETING_PLANS, formatPrice, CONTACT_SALES_HREF, BOOK_DEMO_HREF } from '../../lib/marketingContent';

const MODULES = [
  { name: 'Cloud Accounts', desc: 'Connect AWS accounts and GCP projects once — access-key, cross-account role, or service-account impersonation, your choice.' },
  { name: 'Resources & Containers', desc: 'A live, searchable inventory across EC2, S3, RDS, Compute Engine, Cloud Storage, Cloud SQL, Cloud Run, and Artifact Registry.' },
  { name: 'Cost Management', desc: 'Real spend data with anomaly detection and prioritized savings recommendations — not just a bill you scroll through.' },
  { name: 'Vulnerability Management', desc: 'Findings from across your fleet, deduplicated and triaged by real severity, not just a raw scanner feed.' },
  { name: 'Clusters', desc: 'EKS and GKE in one view — workloads, node health, and cluster-level issues alongside everything else.' },
  { name: 'Monitoring & Alerts', desc: 'Resource-level metrics and alerting that already knows which account and org a resource belongs to.' },
  { name: 'Automation', desc: 'One-click and scheduled remediation — stop/start, right-sizing, and policy-driven fixes with a full audit trail.' },
  { name: 'Reports & Dashboards', desc: 'Custom dashboards and scheduled reports built from the same data your team already sees day to day.' },
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

const COMPLIANCE_BENCHMARKS = [
  { name: 'CIS AWS Foundations', desc: 'Automated checks against the CIS benchmark, scored per account with a live pass rate.' },
  { name: 'PCI DSS', desc: 'Continuous evaluation against PCI DSS controls — not a once-a-year manual questionnaire.' },
  { name: 'ISO 27001', desc: 'ISO 27001 control checks run on the same schedule as everything else, no separate audit tool required.' },
];

const SECURITY_FEATURES = [
  { title: 'Credentials encrypted at rest', desc: 'AWS keys and GCP service-account keys are AES-GCM encrypted before they ever touch storage, with a fresh IV per record.' },
  { title: 'Org-scoped RBAC', desc: 'Every role grant is scoped to an organization and, where it matters, to a single cloud account — not a blanket admin toggle.' },
  { title: 'Full audit log', desc: 'Every write — connecting an account, running a remediation, changing a role — is recorded with who, what, and when.' },
  { title: 'Rate-limited by design', desc: 'API abuse protection is enforced atomically at the database layer, consistent across every instance of every service.' },
  { title: 'Compliance mappings', desc: 'SOC 2 and CIS benchmark mappings on Business plans and above; ISO 27001 and HIPAA-ready posture on Enterprise.' },
  { title: 'SSO / SAML', desc: 'Single sign-on on Professional and above; full SAML SSO on Business and Enterprise.' },
];

const FAQS = [
  { q: 'Which clouds does HorizonVigil support today?', a: 'AWS and Google Cloud, both with real, live scanning — not a roadmap promise. Azure support is planned but not yet built; we\'d rather ship two clouds well than three clouds half-finished.' },
  { q: 'How does account access work?', a: 'For AWS, connect via a scoped access key or a cross-account IAM role — no long-lived key required if you use the role. For GCP, connect via a service-account key or service-account impersonation.' },
  { q: 'Is there a free plan?', a: 'Yes. Free connects one cloud account for two users, with 7-day data retention — enough to see real value before you pay anything.' },
  { q: 'Can I cancel or change plans anytime?', a: 'Yes, from the in-app billing portal. Downgrades and cancellations take effect at the end of your current billing period; there\'s no lock-in contract below Enterprise.' },
  { q: 'What happens to my data if I downgrade?', a: 'Nothing is deleted. Your resource inventory and history stay intact — only your data-retention window and included limits change to match the new plan.' },
  { q: 'Do you offer annual billing?', a: 'Yes — every paid plan has an annual price roughly 20% below paying monthly, shown on the pricing page.' },
];

function Section({ id, className = '', children }: { id?: string; className?: string; children: React.ReactNode }) {
  return <section id={id} className={`max-w-6xl mx-auto px-5 py-20 ${className}`}>{children}</section>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-3">{children}</div>;
}

export function MarketingHome() {
  return (
    <div className="bg-white dark:bg-slate-950">
      <MarketingNav />
      <Hero />
      <TrustBar />
      <ProductOverview />
      <PlatformCapabilities />
      <CloudProviders />
      <ArchitectureOverview />
      <AICapabilities />
      <SecurityCompliance />
      <ComplianceBenchmarks />
      <ProductPreview />
      <PricingTeaser />
      <CustomerBenefits />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <MarketingFooter />
    </div>
  );
}

function Hero() {
  return (
    <Section className="pt-20 pb-16 text-center">
      <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 mb-6">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Now supporting AWS and Google Cloud
      </div>
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-slate-900 dark:text-white text-balance max-w-3xl mx-auto">
        One control plane for every AWS and GCP account you run.
      </h1>
      <p className="text-lg text-slate-600 dark:text-slate-300 mt-6 max-w-xl mx-auto text-balance">
        Inventory, cost, security, and automated remediation — unified across every cloud account your team owns, without stitching together five different consoles.
      </p>
      <div className="flex items-center justify-center gap-3 mt-8 flex-wrap">
        <Link to="/signup" className="text-sm font-semibold px-6 py-3 rounded-md bg-brand-600 hover:bg-brand-700 text-white">
          Start free — no credit card
        </Link>
        <a href={BOOK_DEMO_HREF} className="text-sm font-semibold px-6 py-3 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900">
          Book a demo
        </a>
      </div>
    </Section>
  );
}

function TrustBar() {
  const items = ['AWS', 'Google Cloud', 'EKS', 'GKE', 'AES-256 encryption', 'SOC 2 mapped'];
  return (
    <div className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
      <div className="max-w-6xl mx-auto px-5 py-6 flex items-center justify-center gap-x-8 gap-y-3 flex-wrap text-sm font-medium text-slate-500 dark:text-slate-400">
        {items.map(i => <span key={i}>{i}</span>)}
      </div>
    </div>
  );
}

function ProductOverview() {
  return (
    <Section>
      <div className="text-center max-w-2xl mx-auto mb-14">
        <Eyebrow>Product overview</Eyebrow>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-balance">Everything your cloud ops team checks daily, in one place.</h2>
        <p className="text-slate-600 dark:text-slate-300 mt-4">
          HorizonVigil connects directly to your AWS accounts and GCP projects, builds a live inventory, and layers cost, security, and automation on top — so the answer to "what's running, what does it cost, and is it safe" is always one login away.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {BENEFITS.map(b => (
          <div key={b.label} className="text-center">
            <div className="text-3xl font-bold text-brand-600 dark:text-brand-400 mb-2">{b.stat}</div>
            <div className="text-sm text-slate-600 dark:text-slate-300">{b.label}</div>
          </div>
        ))}
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
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Nine modules. One data model.</h2>
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

function CloudProviders() {
  return (
    <Section>
      <div className="text-center max-w-2xl mx-auto mb-14">
        <Eyebrow>Supported cloud providers</Eyebrow>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Real scanners, not a roadmap slide.</h2>
        <p className="text-slate-600 dark:text-slate-300 mt-4">Azure support is planned; we're not listing it here until it's actually built.</p>
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
        <div className="text-center max-w-2xl mx-auto mb-14">
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
 * Distinct from SecurityCompliance above: that section covers plan-gated
 * compliance *mappings* (SOC 2, HIPAA-ready posture). This is the live,
 * automated benchmark scanning every connected account gets — real API
 * (getComplianceBenchmarks), real frameworks (see the ComplianceBenchmark
 * type in lib/api.ts), not the same claim restated.
 */
function ComplianceBenchmarks() {
  return (
    <Section>
      <div className="text-center max-w-2xl mx-auto mb-14">
        <Eyebrow>Compliance</Eyebrow>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Live benchmark scoring, not a once-a-year checklist.</h2>
        <p className="text-slate-600 dark:text-slate-300 mt-4">Every connected account is checked against real compliance frameworks on an ongoing basis, with a pass rate you can see at any time — under Vulnerability Management › Compliance.</p>
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
      <div className="text-center max-w-2xl mx-auto mb-14">
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

function Testimonials() {
  const quotes = [
    { quote: 'We connected our AWS and GCP accounts in an afternoon and had a real cost picture by the next morning — no consultant required.', name: 'Priya M.', role: 'VP Engineering, mid-market e-commerce platform' },
    { quote: 'The audit log alone justified switching. Every remediation is traceable to a person and a timestamp, which our compliance review actually asked for by name.', name: 'Daniel K.', role: 'Head of Platform, fintech infrastructure team' },
    { quote: 'Vulnerability findings used to be a spreadsheet three people maintained. Now it\'s a view everyone just checks.', name: 'Sara L.', role: 'Security Lead, healthcare SaaS' },
  ];
  return (
    <Section className="bg-slate-50 dark:bg-slate-900/30 !max-w-none">
      <div className="max-w-6xl mx-auto px-5">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Eyebrow>What early customers say</Eyebrow>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Representative feedback</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Illustrative quotes from design-partner conversations.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {quotes.map(t => (
            <div key={t.name} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed flex-grow">"{t.quote}"</p>
              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{t.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
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
