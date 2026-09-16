import { Link } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { CONTACT_SALES_HREF } from '../../lib/marketingContent';

const STEPS = [
  {
    title: '1. Create your account and organization',
    body: "Sign up with an email and password. On first login you'll create an organization — the top-level container for your cloud accounts, users, and role grants.",
  },
  {
    title: '2. Connect an AWS account',
    body: 'From Cloud Accounts, choose "Connect AWS Account". AWS connections currently use a scoped access key. Cross-account IAM role support is built but not yet certified, so it remains disabled until certification is complete. V1 discovery access is read-only.',
  },
  {
    title: '3. Or connect a GCP project',
    body: "Choose \"Connect GCP Project\" and either provide a service-account key JSON or configure service-account impersonation. Credential handling follows the platform's configured security controls. You'll select the regions and services available for discovery.",
  },
  {
    title: '4. Let discovery run',
    body: "The first sync builds your resource inventory. Completion time depends on account size, enabled regions/services, AWS or GCP API limits, and permissions. You can monitor the account's sync status while discovery runs.",
  },
  {
    title: '5. Explore your data',
    body: 'Resources, Cost Management, Cloud Security, and Clusters use the connected-account data collected by the platform. Invite teammates from Users & Organizations when you are ready to share access.',
  },
];

const MODULES = [
  {
    name: 'Resources',
    desc: 'A searchable inventory across connected accounts — including EC2, S3, RDS, Compute Engine, Cloud Storage, Cloud SQL, Cloud Run, Artifact Registry, and other supported resources. Filter by account, region, service, or tag where that metadata is available. EKS and GKE workloads and node health are presented under Clusters.',
  },
  {
    name: 'Cloud Security',
    desc: 'Security posture, misconfigurations, exposure, identity risk, and provider-native compliance evidence from supported services. AWS Config conformance-pack evidence is presented as provider-native evidence, not as an independent CIS, SOC 2, or ISO 27001 certification. Vulnerability scanning and CVE capabilities are being redesigned for a future release.',
  },
  {
    name: 'Cost Management',
    desc: 'Cost and spend data broken down by supported account and service dimensions, with automated anomaly analysis where the required billing data is available. Data availability and freshness depend on the connected cloud provider and account configuration.',
  },
  {
    name: 'Cost Optimization',
    desc: 'Evidence-backed recommendations for supported idle, oversized, and otherwise inefficient resources, with an exclusion workflow for intentional spend. V1 does not directly mutate your cloud resources; recommendations can provide remediation guidance and supported hand-off workflows.',
  },
  {
    name: 'Automation',
    desc: 'Automation configuration and policy workflows are designed to keep operational decisions auditable. In the current release, cloud-resource mutations are not executed directly by HorizonVigil, and scheduled or automatic triggering is not yet live. Actions available today are initiated explicitly by an authorized user.',
  },
  {
    name: 'Reports',
    desc: 'Custom dashboards and on-demand report generation, including CSV/PDF outputs where supported, using the same product data shown in the application. Scheduled recurring delivery is not currently live.',
  },
  {
    name: 'Monitoring',
    desc: 'Resource-level metrics and alerting for supported resources, with account and organization context. Available metrics, alert rules, and notification capabilities depend on the connected provider and configured services.',
  },
  {
    name: 'Issues',
    desc: 'A unified view of supported cost, security, and alert items that need attention, helping teams review outstanding work without switching between separate module views.',
  },
];

export function Docs() {
  return (
    <div className="bg-white dark:bg-slate-950 min-h-screen flex flex-col">
      <MarketingNav />

      <main className="flex-grow" id="main-content">
        <header className="max-w-3xl mx-auto px-5 pt-16 pb-8 text-center">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white text-balance">
            Documentation
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-4 max-w-xl mx-auto">
            Everything you need to go from signup to a connected cloud account — plus a practical overview of the modules available in HorizonVigil.
          </p>
        </header>

        <section
          aria-labelledby="getting-started-heading"
          className="max-w-3xl mx-auto px-5 pb-16 w-full"
        >
          <div
            id="getting-started-heading"
            className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-4"
          >
            Getting started
          </div>

          <ol className="flex flex-col gap-4 list-none p-0 m-0">
            {STEPS.map((step) => (
              <li
                key={step.title}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
              >
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
                  {step.title}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="modules-heading"
          className="bg-slate-50 dark:bg-slate-900/30 py-16"
        >
          <div className="max-w-6xl mx-auto px-5">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-3">
                Platform modules
              </div>
              <h2
                id="modules-heading"
                className="text-3xl font-bold text-slate-900 dark:text-white"
              >
                What each module does.
              </h2>
              <p className="text-slate-600 dark:text-slate-300 mt-4">
                Modules use the connected-account data and organization-scoped permissions available to your account. You do not need to create a separate cloud connection for each module.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {MODULES.map((module) => (
                <article
                  key={module.name}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
                >
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
                    {module.name}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {module.desc}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="help-heading"
          className="max-w-3xl mx-auto px-5 py-16 w-full"
        >
          <div
            id="help-heading"
            className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-4 text-center"
          >
            Get help
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-6 text-center">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              Need help with a specific setup?
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Our team can help with account connections, cross-account roles, service-account impersonation, and SSO configuration.
            </p>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a
                href={CONTACT_SALES_HREF}
                className="text-sm font-semibold px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                Contact us
              </a>
              <Link
                to="/signup"
                className="text-sm font-semibold px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-700 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                Start free
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
