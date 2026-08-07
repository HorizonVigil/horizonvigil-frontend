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
    body: 'From Cloud Accounts, choose "Connect AWS Account" and pick a method: a scoped access key (fastest to set up) or a cross-account IAM role (no long-lived key stored — recommended for production). Either way, CloudOps360 only requests read access unless you separately enable automation.',
  },
  {
    title: '3. Or connect a GCP project',
    body: 'Choose "Connect GCP Project" and either upload a service-account key JSON, or set up service-account impersonation so CloudOps360 never holds a long-lived credential at all. You\'ll pick which regions/services to scan.',
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

export function Docs() {
  return (
    <div className="bg-white dark:bg-slate-950 min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-grow max-w-3xl mx-auto px-5 py-16 w-full">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Documentation</h1>
        <p className="text-slate-600 dark:text-slate-300 mt-3 mb-10">
          We're still building out a full documentation site. In the meantime, here's everything you need to go from signup to a connected, live account inventory.
        </p>

        <div className="flex flex-col gap-6">
          {STEPS.map(s => (
            <div key={s.title} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">{s.title}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{s.body}</div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-6 text-center">
          <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Need help with a specific setup?</div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Cross-account roles, service-account impersonation, and SSO setup all have edge cases we're happy to walk through directly.</p>
          <div className="flex items-center justify-center gap-3">
            <a href={CONTACT_SALES_HREF} className="text-sm font-semibold px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800">Contact us</a>
            <Link to="/signup" className="text-sm font-semibold px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-700 text-white">Start free</Link>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
