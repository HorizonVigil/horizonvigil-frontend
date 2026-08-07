import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { useTabParam } from '../lib/useTabParam';
import { useToast } from '../lib/toast';
import { api, type BillingPlan, type BillingSubscription, type BillingInvoice, type BillingUsageMetric, type BillingReferral } from '../lib/api';

const TABS = ['Plans', 'Usage', 'Invoices', 'Referrals'] as const;
type Tab = typeof TABS[number];

function formatCents(cents: number, currency: string): string {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 });
}

const METRIC_LABELS: Record<string, string> = {
  cloud_accounts: 'Cloud Accounts', users: 'Users', api_requests: 'API Requests',
  ai_requests: 'AI Requests', storage_gb: 'Storage (GB)', automations: 'Automations / mo',
};

export function Subscription() {
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Plans');
  const { toast } = useToast();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<BillingPlan | null>(null);
  const [usage, setUsage] = useState<Record<string, BillingUsageMetric> | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralRedemptions, setReferralRedemptions] = useState<BillingReferral[]>([]);
  const [referralTotalCreditedCents, setReferralTotalCreditedCents] = useState(0);
  const [referralCreditCents, setReferralCreditCents] = useState(0);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, subRes, usageRes, invoicesRes, referralsRes] = await Promise.all([
        api.getBillingPlans(),
        api.getCurrentSubscription(),
        api.getBillingUsage().catch(() => null),
        api.getBillingInvoices({ limit: 50 }).catch(() => null),
        api.getReferrals().catch(() => null),
      ]);
      setPlans(plansRes.items);
      setSubscription(subRes.subscription);
      setCurrentPlan(subRes.plan);
      if (usageRes) setUsage(usageRes.metrics);
      if (invoicesRes) setInvoices(invoicesRes.items);
      if (referralsRes) {
        setReferralCode(referralsRes.code);
        setReferralRedemptions(referralsRes.redemptions);
        setReferralTotalCreditedCents(referralsRes.totalCreditedCents);
        setReferralCreditCents(referralsRes.creditPerReferralCents);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load subscription data', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  async function handleSubscribe(plan: BillingPlan) {
    setSubscribing(plan.key);
    try {
      const result = await api.createSubscription({ planKey: plan.key, billingInterval });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      toast(`Subscribed to ${plan.name}.`, 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to subscribe', 'error');
    } finally {
      setSubscribing(null);
    }
  }

  async function handleRedeemReferral(e: React.FormEvent) {
    e.preventDefault();
    setRedeeming(true);
    try {
      const result = await api.redeemReferral(redeemCode.trim());
      toast(`Referral applied — $${(result.creditedCents / 100).toFixed(0)} credited to the referring org.`, 'success');
      setRedeemCode('');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to redeem referral code', 'error');
    } finally {
      setRedeeming(false);
    }
  }

  async function handleCopyReferralLink() {
    if (!referralCode) return;
    await navigator.clipboard.writeText(referralCode).catch(() => {});
    toast('Referral code copied.', 'success');
  }

  async function handleManageBilling() {
    try {
      const { portalUrl } = await api.getBillingPortalUrl();
      window.location.href = portalUrl;
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to open billing portal', 'error');
    }
  }

  const invoiceColumns: Column<BillingInvoice>[] = [
    { key: 'number', header: 'Invoice', render: i => i.invoice_number, sortValue: i => i.invoice_number },
    { key: 'status', header: 'Status', render: i => <Badge>{i.status}</Badge>, sortValue: i => i.status },
    { key: 'amount', header: 'Amount', render: i => formatCents(i.amount_due_cents, i.currency), sortValue: i => i.amount_due_cents },
    { key: 'period', header: 'Period', render: i => `${new Date(i.period_start).toLocaleDateString()} – ${new Date(i.period_end).toLocaleDateString()}` },
    { key: 'paid', header: 'Paid', render: i => i.paid_at ? new Date(i.paid_at).toLocaleDateString() : '—' },
    { key: 'pdf', header: '', render: i => i.pdf_url ? <a href={i.pdf_url} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline text-xs">Download</a> : null },
  ];

  return (
    <div>
      <FilterBar title="Subscription" breadcrumb={<Breadcrumb />} showRegionFilter={false} showDateFilter={false} />

      {subscription && currentPlan && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Current plan</div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              {currentPlan.name}
              <Badge tone={subscription.status === 'active' ? 'good' : subscription.status === 'past_due' ? 'warning' : 'neutral'}>{subscription.status}</Badge>
            </div>
          </div>
          {subscription.payment_provider && (
            <button onClick={handleManageBilling} className="text-sm font-medium px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
              Manage billing
            </button>
          )}
        </div>
      )}

      <div className="flex gap-1 text-sm flex-wrap mb-4">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Plans' && (
        <>
          <div className="flex items-center gap-2 mb-5 text-sm">
            <button onClick={() => setBillingInterval('monthly')} className={`px-3 py-1.5 rounded-md ${billingInterval === 'monthly' ? 'bg-brand-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`}>Monthly</button>
            <button onClick={() => setBillingInterval('annual')} className={`px-3 py-1.5 rounded-md ${billingInterval === 'annual' ? 'bg-brand-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`}>Annual <span className="text-xs opacity-80">(save ~20%)</span></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {plans.map(plan => {
              const isCurrent = currentPlan?.key === plan.key;
              const priceCents = billingInterval === 'annual' ? plan.annual_price_cents : plan.monthly_price_cents;
              return (
                <div key={plan.id} className={`rounded-xl border p-4 flex flex-col bg-white dark:bg-slate-900 ${isCurrent ? 'border-brand-600 ring-1 ring-brand-600' : 'border-slate-200 dark:border-slate-800'}`}>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{plan.name}</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    {plan.key === 'enterprise' ? 'Custom' : formatCents(priceCents, plan.currency)}
                    {plan.key !== 'enterprise' && <span className="text-xs font-normal text-slate-400">/mo</span>}
                  </div>
                  <ul className="text-xs text-slate-600 dark:text-slate-300 flex flex-col gap-1 mb-4 flex-grow">
                    <li>{plan.included_cloud_accounts === -1 ? 'Unlimited' : plan.included_cloud_accounts} cloud accounts</li>
                    <li>{plan.included_users === -1 ? 'Unlimited' : plan.included_users} users</li>
                    <li>{plan.included_automations === -1 ? 'Unlimited' : plan.included_automations} automations/mo</li>
                    <li>{plan.data_retention_days === -1 ? 'Unlimited' : `${plan.data_retention_days}-day`} retention</li>
                  </ul>
                  <button
                    disabled={isCurrent || subscribing === plan.key || !!subscription}
                    onClick={() => handleSubscribe(plan)}
                    className={`text-xs font-semibold py-2 rounded-md text-center ${isCurrent ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-default' : 'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50'}`}
                  >
                    {isCurrent ? 'Current plan' : subscribing === plan.key ? 'Starting…' : plan.key === 'enterprise' ? 'Talk to sales' : subscription ? 'Use "Manage billing" to switch' : 'Subscribe'}
                  </button>
                </div>
              );
            })}
          </div>
          {!loading && plans.length === 0 && <p className="text-sm text-slate-400">No plans available.</p>}
        </>
      )}

      {tab === 'Usage' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {usage && Object.entries(usage).map(([key, metric]) => (
            <StatCard
              key={key}
              label={METRIC_LABELS[key] ?? key}
              value={metric.tracked ? String(metric.used) : '—'}
              caption={metric.tracked ? (metric.included != null ? `of ${metric.included === -1 ? 'unlimited' : metric.included}` : undefined) : metric.reason}
            />
          ))}
          {!usage && !loading && <p className="text-sm text-slate-400 col-span-full">No usage data yet — subscribe to a plan first.</p>}
        </div>
      )}

      {tab === 'Invoices' && (
        <DataTable columns={invoiceColumns} rows={invoices} rowKey={i => i.id} emptyMessage="No invoices yet." />
      )}

      {tab === 'Referrals' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Your referral code</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Share this code — when another organization redeems it, you're credited ${(referralCreditCents / 100).toFixed(0)}.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-lg font-mono font-semibold px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">{referralCode ?? '—'}</code>
              <button onClick={handleCopyReferralLink} disabled={!referralCode} className="text-xs font-medium px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
                Copy
              </button>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-3">
              Total credited so far: <span className="font-semibold text-slate-700 dark:text-slate-200">${(referralTotalCreditedCents / 100).toFixed(0)}</span>
            </div>
          </div>

          <form onSubmit={handleRedeemReferral} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-wrap items-end gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Have a referral code?</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Redeem someone else's code to credit their account.</p>
              <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                Code
                <input required value={redeemCode} onChange={e => setRedeemCode(e.target.value)} placeholder="ABCD1234" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white w-40 font-mono uppercase" />
              </label>
            </div>
            <button type="submit" disabled={redeeming || !redeemCode.trim()} className="text-xs font-semibold px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white">
              {redeeming ? 'Redeeming…' : 'Redeem'}
            </button>
          </form>

          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Referrals you've made</div>
            <DataTable
              columns={[
                { key: 'status', header: 'Status', render: r => <Badge tone={r.status === 'credited' ? 'good' : 'neutral'}>{r.status}</Badge> },
                { key: 'credited', header: 'Credited', render: r => `$${(r.discount_credited_cents / 100).toFixed(0)}` },
                { key: 'date', header: 'Date', render: r => new Date(r.created_at).toLocaleDateString() },
              ]}
              rows={referralRedemptions}
              rowKey={r => r.id}
              emptyMessage="No referrals redeemed yet."
            />
          </div>
        </div>
      )}
    </div>
  );
}
