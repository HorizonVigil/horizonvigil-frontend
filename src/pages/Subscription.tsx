import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { useToast } from '../lib/toast';
import { api, type BillingPlan, type BillingSubscription, type BillingInvoice, type BillingUsageMetric, type BillingReferral, type BillingAddon, type BillingCoupon } from '../lib/api';
import { CONTACT_SALES_HREF } from '../lib/marketingContent';

const TABS = ['Plans', 'Usage', 'Invoices', 'Referrals'] as const;
type Tab = typeof TABS[number];

function formatCents(cents: number, currency: string): string {
  const amount = Number.isFinite(cents) ? cents / 100 : 0;
  const normalizedCurrency = (currency || 'USD').toUpperCase();

  try {
    return amount.toLocaleString(undefined, {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 0,
    });
  } catch {
    return `${normalizedCurrency} ${amount.toFixed(0)}`;
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
}

function formatReferralCents(cents: number): string {
  const amount = Number.isFinite(cents) ? cents / 100 : 0;
  return amount.toFixed(0);
}

const METRIC_LABELS: Record<string, string> = {
  cloud_accounts: 'Cloud Accounts', users: 'Users', api_requests: 'API Requests',
  ai_requests: 'AI Requests', storage_gb: 'Storage (GB)', automations: 'Automations / mo',
};

export function Subscription() {
  const canSeeTab = useSubmenuAccess('credit-card');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Plans');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);
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
  const [addons, setAddons] = useState<BillingAddon[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponRedeeming, setCouponRedeeming] = useState(false);
  const [checkedCoupon, setCheckedCoupon] = useState<BillingCoupon | null>(null);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerStatus, setProviderStatus] = useState<{ provider: string; configured: boolean; mode: 'test' | 'live' | 'none' } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [billingPortalLoading, setBillingPortalLoading] = useState(false);
  const loadRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError(null);

    const results = await Promise.allSettled([
      api.getBillingPlans(),
      api.getCurrentSubscription(),
      api.getBillingUsage(),
      api.getBillingInvoices({ limit: 50 }),
      api.getReferrals(),
      api.getPaymentProviderStatus(),
      api.getBillingAddons(),
    ]);

    if (requestId !== loadRequestId.current) return;

    const [plansRes, subRes, usageRes, invoicesRes, referralsRes, providerRes, addonsRes] = results;

    if (plansRes.status === 'fulfilled') {
      setPlans(plansRes.value.items ?? []);
    }

    if (subRes.status === 'fulfilled') {
      setSubscription(subRes.value.subscription);
      setCurrentPlan(subRes.value.plan);
    }

    if (usageRes.status === 'fulfilled') {
      setUsage(usageRes.value.metrics ?? {});
    }

    if (invoicesRes.status === 'fulfilled') {
      setInvoices(invoicesRes.value.items ?? []);
    }

    if (referralsRes.status === 'fulfilled') {
      setReferralCode(referralsRes.value.code ?? null);
      setReferralRedemptions(referralsRes.value.redemptions ?? []);
      setReferralTotalCreditedCents(
        Number.isFinite(referralsRes.value.totalCreditedCents)
          ? referralsRes.value.totalCreditedCents
          : 0,
      );
      setReferralCreditCents(
        Number.isFinite(referralsRes.value.creditPerReferralCents)
          ? referralsRes.value.creditPerReferralCents
          : 0,
      );
    }

    if (providerRes.status === 'fulfilled') {
      setProviderStatus(providerRes.value);
    }

    if (addonsRes.status === 'fulfilled') {
      setAddons(addonsRes.value.items ?? []);
    }

    // Plans and current subscription are the essential page state.
    const criticalFailures = [plansRes, subRes].filter(
      result => result.status === 'rejected',
    );

    if (criticalFailures.length > 0) {
      const message = 'Some subscription information could not be loaded. Please retry.';
      setLoadError(message);
      toast(message, 'error');
    }

    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  async function handleSubscribe(plan: BillingPlan) {
    if (subscribing || subscription) return;

    if (!plan.key) {
      toast('This plan is not available for subscription.', 'error');
      return;
    }

    setSubscribing(plan.key);

    try {
      const result = await api.createSubscription({
        planKey: plan.key,
        billingInterval,
      });

      if (result.checkoutUrl) {
        // Navigation intentionally leaves the app for the provider-hosted checkout.
        window.location.assign(result.checkoutUrl);
        return;
      }

      toast(`Subscribed to ${plan.name}.`, 'success');
      await load();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Failed to subscribe',
        'error',
      );
    } finally {
      setSubscribing(null);
    }
  }

  async function handleCheckCoupon(e: React.FormEvent) {
    e.preventDefault();
    const code = couponCode.trim().toUpperCase();
    if (!code || couponChecking) return;

    setCouponChecking(true);
    setCheckedCoupon(null);
    try {
      const result = await api.validateCoupon(code, currentPlan?.key);
      setCheckedCoupon(result.coupon);
      toast(
        `Valid — ${result.coupon.discount_type === 'percent' ? `${result.coupon.discount_value}% off` : `${formatCents(result.coupon.discount_value, 'USD')} off`}.`,
        'success',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Invalid or expired coupon code.', 'error');
    } finally {
      setCouponChecking(false);
    }
  }

  async function handleRedeemCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code || couponRedeeming) return;

    setCouponRedeeming(true);
    try {
      await api.redeemCoupon(code, currentPlan?.key);
      toast('Coupon applied to your subscription.', 'success');
      setCouponCode('');
      setCheckedCoupon(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to apply coupon.', 'error');
    } finally {
      setCouponRedeeming(false);
    }
  }

  async function handleRedeemReferral(e: React.FormEvent) {
    e.preventDefault();

    const code = redeemCode.trim().toUpperCase();

    if (!code) {
      toast('Enter a referral code.', 'error');
      return;
    }

    if (code.length > 64) {
      toast('Referral code is too long.', 'error');
      return;
    }

    if (redeeming) return;

    setRedeeming(true);

    try {
      const result = await api.redeemReferral(code);
      toast(
        `Referral applied — ${formatCents(result.creditedCents, 'USD')} credited to the referring org.`,
        'success',
      );
      setRedeemCode('');
      await load();
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : 'Failed to redeem referral code',
        'error',
      );
    } finally {
      setRedeeming(false);
    }
  }

  async function handleCopyReferralLink() {
    if (!referralCode) return;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable.');
      }

      await navigator.clipboard.writeText(referralCode);
      toast('Referral code copied.', 'success');
    } catch {
      toast('Could not copy the referral code. Please copy it manually.', 'error');
    }
  }

  async function handleManageBilling() {
    if (billingPortalLoading) return;

    setBillingPortalLoading(true);

    try {
      const { portalUrl } = await api.getBillingPortalUrl();

      try {
        const parsed = new URL(portalUrl, window.location.origin);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('Invalid billing portal URL.');
        }
      } catch {
        throw new Error('The billing portal returned an invalid URL.');
      }

      window.location.assign(portalUrl);
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : 'Failed to open billing portal',
        'error',
      );
      setBillingPortalLoading(false);
    }
  }

  const invoiceColumns: Column<BillingInvoice>[] = useMemo(() => [
    {
      key: 'number',
      header: 'Invoice',
      render: i => i.invoice_number || '—',
      sortValue: i => i.invoice_number || '',
    },
    {
      key: 'status',
      header: 'Status',
      render: i => <Badge>{i.status || 'unknown'}</Badge>,
      sortValue: i => i.status || '',
    },
    {
      key: 'amount',
      header: 'Amount',
      render: i => formatCents(i.amount_due_cents, i.currency),
      sortValue: i => Number.isFinite(i.amount_due_cents) ? i.amount_due_cents : 0,
    },
    {
      key: 'period',
      header: 'Period',
      render: i => `${formatDate(i.period_start)} – ${formatDate(i.period_end)}`,
    },
    {
      key: 'paid',
      header: 'Paid',
      render: i => formatDate(i.paid_at),
    },
    {
      key: 'pdf',
      header: '',
      render: i => {
        if (!i.pdf_url) return null;

        try {
          const url = new URL(i.pdf_url, window.location.origin);
          if (!['http:', 'https:'].includes(url.protocol)) return null;

          return (
            <a
              href={url.toString()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline text-xs"
            >
              Download
            </a>
          );
        } catch {
          return null;
        }
      },
    },
  ], []);

  return (
    <div>
      <FilterBar title="Subscription" breadcrumb={<Breadcrumb />} showRegionFilter={false} showDateFilter={false} />

      {loadError && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-4 py-3 mb-5 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700 dark:text-red-300">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="shrink-0 text-xs font-semibold text-red-700 dark:text-red-300 hover:underline disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}

      {providerStatus && providerStatus.mode !== 'live' && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 mb-5 flex items-center gap-2.5">
          <span className="text-amber-600 dark:text-amber-400 text-base leading-none" aria-hidden="true">&#9888;</span>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {providerStatus.mode === 'test' ? (
              <>
                <span className="font-semibold">Test mode &mdash; {providerStatus.provider} is connected with test credentials.</span>{' '}
                Checkout goes through {providerStatus.provider}&apos;s real flow, but only test card numbers work &mdash; no real card is charged.
              </>
            ) : (
              <>
                <span className="font-semibold">Test mode &mdash; no real payment provider is connected yet.</span>{' '}
                Subscribing here simulates a checkout and won&apos;t charge any card.
              </>
            )}
            {' '}Plans, usage, and invoices below are otherwise fully real.
          </p>
        </div>
      )}

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
            <button
              type="button"
              onClick={() => void handleManageBilling()}
              disabled={billingPortalLoading}
              className="text-sm font-medium px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {billingPortalLoading ? 'Opening…' : 'Manage billing'}
            </button>
          )}
        </div>
      )}

      <div className="flex gap-1 text-sm flex-wrap mb-4">
        {visibleTabs.map(t => (
          <button type="button" key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Plans' && loading && (
        <div className="text-sm text-slate-400 py-8 text-center">Loading subscription plans…</div>
      )}

      {tab === 'Plans' && !loading && plans.length === 0 && (
        <EmptyState icon="credit-card" title="No plans available" description="This environment has no billing plans configured yet — nothing to subscribe to until at least one is added." />
      )}

      {tab === 'Plans' && (loading || plans.length > 0) && (
        <>
          <div className="flex items-center gap-2 mb-5 text-sm">
            <button
              type="button"
              aria-pressed={billingInterval === 'monthly'}
              onClick={() => setBillingInterval('monthly')}
              className={`px-3 py-1.5 rounded-md ${billingInterval === 'monthly' ? 'bg-brand-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={billingInterval === 'annual'}
              onClick={() => setBillingInterval('annual')}
              className={`px-3 py-1.5 rounded-md ${billingInterval === 'annual' ? 'bg-brand-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`}
            >
              Annual <span className="text-xs opacity-80">(save ~20%)</span>
            </button>
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
                    {plan.key !== 'enterprise' && (
                      <span className="text-xs font-normal text-slate-400">
                        /{billingInterval === 'annual' ? 'yr' : 'mo'}
                      </span>
                    )}
                  </div>
                  <ul className="text-xs text-slate-600 dark:text-slate-300 flex flex-col gap-1 mb-4 flex-grow">
                    <li>{plan.included_cloud_accounts === -1 ? 'Unlimited' : plan.included_cloud_accounts} cloud accounts</li>
                    <li>{plan.included_users === -1 ? 'Unlimited' : plan.included_users} users</li>
                    <li>{plan.included_automations === -1 ? 'Unlimited' : plan.included_automations} automations/mo</li>
                    <li>{plan.data_retention_days === -1 ? 'Unlimited' : `${plan.data_retention_days}-day`} retention</li>
                  </ul>
                  {plan.key === 'enterprise' && !isCurrent ? (
                    <a
                      href={CONTACT_SALES_HREF}
                      className="text-xs font-semibold py-2 rounded-md text-center bg-brand-600 text-white hover:bg-brand-700"
                    >
                      Talk to sales
                    </a>
                  ) : (
                    <button type="button"
                      disabled={isCurrent || subscribing === plan.key || !!subscription}
                      onClick={() => handleSubscribe(plan)}
                      className={`text-xs font-semibold py-2 rounded-md text-center ${isCurrent ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-default' : 'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50'}`}
                    >
                      {isCurrent
                        ? 'Current plan'
                        : subscribing === plan.key
                          ? 'Starting…'
                          : subscription
                            ? 'Use "Manage billing" to switch'
                            : 'Subscribe'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
            <form onSubmit={handleCheckCoupon} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Have a coupon code?</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Check a code, then apply it to your current subscription.</p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value); setCheckedCoupon(null); }}
                  maxLength={64}
                  placeholder="COUPON CODE"
                  aria-label="Coupon code"
                  className="flex-1 min-w-[10rem] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white uppercase"
                />
                <button type="submit" disabled={couponChecking || !couponCode.trim()} className="text-xs font-medium px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
                  {couponChecking ? 'Checking…' : 'Check code'}
                </button>
              </div>
              {checkedCoupon && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                  <span>
                    {checkedCoupon.code}: {checkedCoupon.discount_type === 'percent' ? `${checkedCoupon.discount_value}% off` : `${formatCents(checkedCoupon.discount_value, 'USD')} off`}
                  </span>
                  <button type="button" disabled={couponRedeeming} onClick={() => void handleRedeemCoupon()} className="font-medium underline disabled:opacity-50">
                    {couponRedeeming ? 'Applying…' : 'Apply'}
                  </button>
                </div>
              )}
            </form>

            {addons.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Add-ons</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Not yet self-serve — contact sales to add one of these to your subscription.</p>
                <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                  {addons.filter(a => a.is_active).map(addon => (
                    <li key={addon.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <div className="text-slate-800 dark:text-slate-100 font-medium">{addon.name}</div>
                        {addon.description && <div className="text-xs text-slate-400">{addon.description}</div>}
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                        {formatCents(addon.price_cents, 'USD')}/{addon.unit_label ?? addon.billing_unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
          {!usage && !loading && (
            <p className="text-sm text-slate-400 col-span-full">
              Usage data is not available yet. Subscribe to a plan first, or retry if you already have one.
            </p>
          )}
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
              Share this code — when another organization redeems it, you're credited ${(referralCreditCents / 100).toFixed(0)} and a new code is generated for your next referral. Each code works once.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-lg font-mono font-semibold px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">{referralCode ?? '—'}</code>
              <button type="button" aria-label="Copy referral code" onClick={() => void handleCopyReferralLink()} disabled={!referralCode} className="text-xs font-medium px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
                Copy
              </button>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-3">
              Total credited so far: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCents(referralTotalCreditedCents, 'USD')}</span>
            </div>
          </div>

          <form onSubmit={handleRedeemReferral} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-wrap items-end gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Have a referral code?</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Redeem someone else's code to credit their account.</p>
              <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                Code
                <input
                  required
                  aria-label="Referral code"
                  value={redeemCode}
                  maxLength={64}
                  autoCapitalize="characters"
                  onChange={e => setRedeemCode(e.target.value)}
                  placeholder="ABCD1234"
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white w-40 font-mono uppercase" />
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
                { key: 'date', header: 'Date', render: r => formatDate(r.created_at) },
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