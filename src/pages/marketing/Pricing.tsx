import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import {
  MARKETING_PLANS,
  formatPrice,
  CONTACT_SALES_HREF,
} from '../../lib/marketingContent';

type BillingInterval = 'monthly' | 'annual';

type MarketingPlan = (typeof MARKETING_PLANS)[number];

interface ComparisonRow {
  label: string;
  get: (plan: MarketingPlan) => ReactNode;
}

const COMPARISON_ROWS: readonly ComparisonRow[] = [
  { label: 'Cloud accounts', get: (plan) => plan.cloudAccounts },
  { label: 'Users', get: (plan) => plan.users },
  { label: 'Automations / month', get: (plan) => plan.automations },
  { label: 'Data retention', get: (plan) => plan.retention },
  { label: 'Support', get: (plan) => plan.support },
  { label: 'Uptime SLA', get: (plan) => plan.sla ?? '—' },
  { label: 'SSO', get: (plan) => (plan.sso ? '✓' : '—') },
  { label: 'SAML SSO', get: (plan) => (plan.samlSso ? '✓' : '—') },
  { label: 'Audit log', get: (plan) => (plan.auditLog ? '✓' : '—') },
];

const PAGE_TITLE_ID = 'pricing-page-title';
const BILLING_TOGGLE_ID = 'billing-interval';

function getPlanCtaLabel(plan: MarketingPlan): string {
  if (plan.key === 'enterprise') {
    return 'Talk to sales';
  }

  return plan.key === 'free' ? 'Start free' : 'Start free trial';
}

export function Pricing() {
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  const isAnnual = interval === 'annual';

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-white flex flex-col">
      <MarketingNav />

      <main id="main-content" aria-labelledby={PAGE_TITLE_ID} className="flex-1">
        <header className="mx-auto w-full max-w-6xl px-5 pt-16 pb-10 text-center sm:px-6 lg:px-8">
          <h1
            id={PAGE_TITLE_ID}
            className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl"
          >
            Start with visibility. Scale into decision intelligence.
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-slate-600 dark:text-slate-300">
            Connect one account free. Add account scale, users, automation,
            retention, and support as your cloud operating model grows.
          </p>

          <div
            id={BILLING_TOGGLE_ID}
            aria-label="Billing interval"
            className="mt-8 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              type="button"
              aria-pressed={interval === 'monthly'}
              onClick={() => setInterval('monthly')}
              className={[
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2',
                'dark:focus-visible:ring-offset-slate-950',
                interval === 'monthly'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
              ].join(' ')}
            >
              Monthly
            </button>

            <button
              type="button"
              aria-pressed={isAnnual}
              onClick={() => setInterval('annual')}
              className={[
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2',
                'dark:focus-visible:ring-offset-slate-950',
                isAnnual
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
              ].join(' ')}
            >
              Annual <span className="opacity-70">(save ~20%)</span>
            </button>
          </div>
        </header>

        <section className="mx-auto w-full max-w-6xl px-5 pb-10 sm:px-6 lg:px-8" aria-labelledby="included-heading">
          <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-5 dark:border-brand-900 dark:bg-brand-950/20 sm:p-6">
            <h2 id="included-heading" className="text-sm font-semibold text-slate-900 dark:text-white">
              A shared operating model at every stage
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Explain', 'Understand the signal and affected resources.'],
                ['Verify', 'Inspect source evidence and coverage.'],
                ['Advise', 'Compare next steps before action.'],
                ['Record', 'Keep ownership and outcomes reviewable.'],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-lg bg-white/80 p-3 dark:bg-slate-900/70">
                  <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="plans-heading"
          className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-6 lg:px-8"
        >
          <h2 id="plans-heading" className="sr-only">
            Available pricing plans
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {MARKETING_PLANS.map((plan) => {
              const cents = isAnnual
                ? plan.annualCents
                : plan.monthlyCents;

              return (
                <article
                  key={plan.key}
                  className={[
                    'flex flex-col rounded-xl border bg-white p-5 dark:bg-slate-900',
                    plan.highlighted
                      ? 'border-brand-600 ring-1 ring-brand-600'
                      : 'border-slate-200 dark:border-slate-800',
                  ].join(' ')}
                >
                  {plan.highlighted && (
                    <div
                      aria-label="Most popular plan"
                      className="mb-2 text-xs font-semibold text-brand-600 dark:text-brand-400"
                    >
                      MOST POPULAR
                    </div>
                  )}

                  <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-white">
                    {plan.name}
                  </h3>

                  <div
                    aria-label={`${plan.name} price`}
                    className="mb-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-white"
                  >
                    {formatPrice(cents, plan.key)}
                    {plan.key !== 'enterprise' && (
                      <span className="text-sm font-normal text-slate-400">
                        /mo
                      </span>
                    )}
                  </div>

                  <p className="mb-5 flex-grow text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {plan.tagline}
                  </p>

                  {plan.key === 'enterprise' ? (
                    <a
                      href={CONTACT_SALES_HREF}
                      className="rounded-md bg-slate-900 py-2.5 text-center text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 dark:bg-white dark:text-slate-900 dark:focus-visible:ring-offset-slate-900"
                    >
                      {getPlanCtaLabel(plan)}
                    </a>
                  ) : (
                    <Link
                      to="/signup"
                      className={[
                        'rounded-md py-2.5 text-center text-xs font-semibold transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2',
                        'dark:focus-visible:ring-offset-slate-900',
                        plan.highlighted
                          ? 'bg-brand-600 text-white hover:bg-brand-700'
                          : 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700',
                      ].join(' ')}
                    >
                      {getPlanCtaLabel(plan)}
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="comparison-heading"
          className="mx-auto w-full max-w-6xl px-5 pb-24 sm:px-6 lg:px-8"
        >
          <h2 id="comparison-heading" className="mb-4 text-2xl font-semibold text-slate-900 dark:text-white">
            Compare plans
          </h2>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">
                Feature comparison across HorizonVigil pricing plans
              </caption>

              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400"
                  >
                    Feature
                  </th>

                  {MARKETING_PLANS.map((plan) => (
                    <th
                      key={plan.key}
                      scope="col"
                      className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white"
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-slate-100 dark:border-slate-800/60"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 pr-4 text-left font-normal text-slate-500 dark:text-slate-400"
                    >
                      {row.label}
                    </th>

                    {MARKETING_PLANS.map((plan) => (
                      <td
                        key={plan.key}
                        className="px-4 py-3 text-slate-700 tabular-nums dark:text-slate-200"
                      >
                        {row.get(plan)}
                      </td>
                    ))}
                  </tr>
                ))}

                <tr>
                  <th
                    scope="row"
                    className="px-4 py-3 pr-4 text-left align-top font-normal text-slate-500 dark:text-slate-400"
                  >
                    Compliance
                  </th>

                  {MARKETING_PLANS.map((plan) => (
                    <td
                      key={plan.key}
                      className="px-4 py-3 align-top text-slate-700 dark:text-slate-200"
                    >
                      {plan.compliance.length === 0 ? (
                        '—'
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {plan.compliance.map((complianceItem) => (
                            <li key={complianceItem}>{complianceItem}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-400 dark:text-slate-500">
            SSO and SAML SSO require a one-time identity-provider registration
            we complete with you — they are not self-service yet. Uptime SLA
            figures are targets, not a contractual guarantee below Enterprise;
            see our Terms of Service for the exact commitment applicable to
            your plan.
          </p>
        </section>

        <section
          aria-labelledby="sales-heading"
          className="pb-24 px-5 text-center"
        >
          <h2 id="sales-heading" className="sr-only">
            Custom requirements
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Need something custom — a private deployment, extra retention, or
            a specific compliance requirement?
          </p>

          <a
            href={CONTACT_SALES_HREF}
            className="mt-1 inline-block text-sm font-semibold text-brand-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 dark:text-brand-400 dark:focus-visible:ring-offset-slate-950"
          >
            Talk to sales →
          </a>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
