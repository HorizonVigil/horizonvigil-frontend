import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { MARKETING_PLANS, formatPrice, CONTACT_SALES_HREF } from '../../lib/marketingContent';

const ROWS: { label: string; get: (p: typeof MARKETING_PLANS[number]) => React.ReactNode }[] = [
  { label: 'Cloud accounts', get: p => p.cloudAccounts },
  { label: 'Users', get: p => p.users },
  { label: 'Automations / month', get: p => p.automations },
  { label: 'Data retention', get: p => p.retention },
  { label: 'Support', get: p => p.support },
  { label: 'Uptime SLA', get: p => p.sla ?? '—' },
  { label: 'SSO', get: p => p.sso ? '✓' : '—' },
  { label: 'SAML SSO', get: p => p.samlSso ? '✓' : '—' },
  { label: 'Audit log', get: p => p.auditLog ? '✓' : '—' },
];

export function Pricing() {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');

  return (
    <div className="bg-white dark:bg-slate-950 min-h-screen flex flex-col">
      <MarketingNav />

      <main className="flex-grow">
        <div className="max-w-6xl mx-auto px-5 pt-16 pb-10 text-center">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white">Pricing that scales with your fleet.</h1>
          <p className="text-slate-600 dark:text-slate-300 mt-4 max-w-xl mx-auto">Start free. Upgrade when you have more accounts to connect, not before.</p>

          <div className="inline-flex items-center gap-1 mt-8 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setInterval('monthly')}
              className={`text-sm font-medium px-4 py-1.5 rounded-md ${interval === 'monthly' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval('annual')}
              className={`text-sm font-medium px-4 py-1.5 rounded-md ${interval === 'annual' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Annual <span className="opacity-70">(save ~20%)</span>
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-5 pb-20">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {MARKETING_PLANS.map(p => {
              const cents = interval === 'annual' ? p.annualCents : p.monthlyCents;
              return (
                <div key={p.key} className={`rounded-xl border p-5 flex flex-col bg-white dark:bg-slate-900 ${p.highlighted ? 'border-brand-600 ring-1 ring-brand-600' : 'border-slate-200 dark:border-slate-800'}`}>
                  {p.highlighted && <div className="text-xs font-semibold text-brand-600 dark:text-brand-400 mb-2">MOST POPULAR</div>}
                  <div className="text-base font-semibold text-slate-900 dark:text-white mb-1">{p.name}</div>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
                    {formatPrice(cents, p.key)}
                    {p.key !== 'enterprise' && <span className="text-sm font-normal text-slate-400">/mo</span>}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 flex-grow">{p.tagline}</p>
                  {p.key === 'enterprise' ? (
                    <a href={CONTACT_SALES_HREF} className="text-xs font-semibold py-2.5 rounded-md text-center bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90">Talk to sales</a>
                  ) : (
                    <Link to="/signup" className={`text-xs font-semibold py-2.5 rounded-md text-center ${p.highlighted ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                      {p.key === 'free' ? 'Start free' : 'Start free trial'}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-5 pb-24 overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="text-left py-3 pr-4 font-semibold text-slate-500 dark:text-slate-400">Compare plans</th>
                {MARKETING_PLANS.map(p => (
                  <th key={p.key} className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row.label} className="border-b border-slate-100 dark:border-slate-800/60">
                  <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">{row.label}</td>
                  {MARKETING_PLANS.map(p => (
                    <td key={p.key} className="py-3 px-4 text-slate-700 dark:text-slate-200 tabular-nums">{row.get(p)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="py-3 pr-4 text-slate-500 dark:text-slate-400 align-top">Compliance</td>
                {MARKETING_PLANS.map(p => (
                  <td key={p.key} className="py-3 px-4 text-slate-700 dark:text-slate-200 align-top">
                    {p.compliance.length === 0 ? '—' : (
                      <ul className="flex flex-col gap-1">
                        {p.compliance.map(c => <li key={c}>{c}</li>)}
                      </ul>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="text-center pb-24">
          <p className="text-sm text-slate-500 dark:text-slate-400">Need something custom — a private deployment, extra retention, or a specific compliance requirement?</p>
          <a href={CONTACT_SALES_HREF} className="text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline mt-1 inline-block">Talk to sales →</a>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
