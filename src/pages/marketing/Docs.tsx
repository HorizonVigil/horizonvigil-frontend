import { Link } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { CONTACT_SALES_HREF } from '../../lib/marketingContent';

const STEPS = [
  {
    title: '1. Create your account and organization',
    body: 'Sign up with an email and password. On first login you\'ll be asked to create an organization — that\'s the top-level container every cloud account, user, and role grant lives under.',
  },
  {
    title: '2. Connect an AWS account',
    body: 'From Cloud Accounts, choose "Connect AWS Account" and pick a method: a scoped access key (fastest to set up) or a cross-account IAM role (no long-lived key stored — recommended for production). Either way, HorizonVigil only requests read access unless you separately enable automation.',
  },
  {
    title: '3. Or connect a GCP project',
    body: 'Choose "Connect GCP Project" and either upload a service-account key JSON, or set up service-account impersonation so HorizonVigil never holds a long-lived credential at all. You\'ll pick which regions/services to scan.',
  },
  {
    title: '4. Let discovery run',
    body: 'The first sync builds your full resource inventory — this typically completes within a few minutes depending on account size. You can watch progress live from the account\'s Sync Center.',
  },
  {
    title: '5. Explore your data',
    body: 'Resources, Cost Management, Vulnerability Management, and Clusters all populate from the same sync — no separate setup per module. Invite teammates from Users & Organizations once you\'re ready to share access.',
  },
];

const MODULES = [
  {
    name: 'Resources',
    desc: 'A live, searchable inventory across every connected account — EC2, S3, RDS, Compute Engine, Cloud Storage, Cloud SQL, Cloud Run, Artifact Registry, and more. Filter by account, region, service, or tag, and drill into any resource for its full configuration. EKS and GKE workloads and node health live under Clusters, one level deeper.',
  },
  {
    name: 'Vulnerability Management',
    desc: 'Findings from across your fleet, deduplicated and triaged by real severity rather than a raw scanner feed. Includes live compliance benchmark scoring against CIS AWS Foundations, PCI DSS, and ISO 27001, viewable per account under Vulnerability Management › Compliance.',
  },
  {
    name: 'Cost Management',
    desc: 'Real spend data broken down by account and service, with anomaly detection that flags unusual spend — a sudden jump in a region or service — before it shows up as a surprise on the bill.',
  },
  {
    name: 'Cost Optimization',
    desc: 'Specific savings recommendations for idle and oversized resources, with an exclusion workflow for spend that\'s intentional. Fixes apply one-click, or as an Auto-PR against a connected GitHub repo for changes you want reviewed first.',
  },
  {
    name: 'Automation',
    desc: 'One-click and scheduled remediation — stop/start, right-sizing, and policy-driven fixes — with a full audit trail of who ran what, on which resource, and when. Requires editor role or above.',
  },
  {
    name: 'Reports',
    desc: 'Custom dashboards and scheduled reports built from the same live data your team already sees day to day, so stakeholders get a snapshot without needing their own login.',
  },
  {
    name: 'Monitoring',
    desc: 'Resource-level metrics and alerting that already knows which account and organization a resource belongs to. Alert rules and notification routing live alongside it under Alerts.',
  },
  {
    name: 'AI Copilot',
    desc: 'Ask about your environment in plain language and get answers grounded in your actual connected-account data, with cited sources — not a generic model guessing at what you might have running.',
  },
  {
    name: 'Issues',
    desc: 'Cost, security, and alert items that need attention, unified into one severity-sorted list — the fastest way to answer "what\'s actually urgent" without checking three modules separately.',
  },
];

export function Docs() {
  return (
    <div className="bg-white dark:bg-slate-950 min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-grow">
        <div className="max-w-3xl mx-auto px-5 pt-16 pb-8 text-center">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white text-balance">Documentation</h1>
          <p className="text-slate-600 dark:text-slate-300 mt-4 max-w-xl mx-auto">
            Everything you need to go from signup to a connected, live account inventory — plus a tour of every module once you're in.
          </p>
        </div>

        <div className="max-w-3xl mx-auto px-5 pb-16 w-full">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-4">Getting started</div>
          <div className="flex flex-col gap-4">
            {STEPS.map(s => (
              <div key={s.title} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">{s.title}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{s.body}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/30 py-16">
          <div className="max-w-6xl mx-auto px-5">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-3">Platform modules</div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white">What each module does.</h2>
              <p className="text-slate-600 dark:text-slate-300 mt-4">
                Every module reads from the same connected accounts and org-scoped permissions — connect once, nothing needs separate setup per module.
              </p>
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
        </div>

        <div className="max-w-3xl mx-auto px-5 py-16 w-full">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-4 text-center">Get help</div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-6 text-center">
            <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Need help with a specific setup?</div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Cross-account roles, service-account impersonation, and SSO setup all have edge cases we're happy to walk through directly.</p>
            <div className="flex items-center justify-center gap-3">
              <a href={CONTACT_SALES_HREF} className="text-sm font-semibold px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800">Contact us</a>
              <Link to="/signup" className="text-sm font-semibold px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-700 text-white">Start free</Link>
            </div>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
