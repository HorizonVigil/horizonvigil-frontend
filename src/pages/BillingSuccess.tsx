import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type BillingSubscription } from '../lib/api';

/**
 * Landing page after a Stripe Checkout redirect. The real subscription row
 * is created by the webhook (checkout.session.completed), which can lag a
 * few seconds behind the redirect — this polls briefly rather than assuming
 * it's already there the instant the page loads.
 */
export function BillingSuccess() {
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    async function poll() {
      if (cancelled) return;
      try {
        const res = await api.getCurrentSubscription();
        if (res.subscription) {
          if (!cancelled) { setSubscription(res.subscription); setChecking(false); }
          return;
        }
      } catch { /* keep polling */ }
      attempts++;
      if (attempts < 8 && !cancelled) setTimeout(poll, 2000);
      else if (!cancelled) setChecking(false);
    }
    void poll();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-sm text-center">
        <div className="text-3xl mb-3">✓</div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          {checking ? 'Confirming your subscription…' : subscription ? 'You\'re subscribed' : 'Payment received'}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          {checking
            ? 'Stripe confirmed your payment — activating your plan now.'
            : subscription
              ? 'Your new plan is active.'
              : 'This is taking longer than expected. Your plan will activate shortly — check back in a minute.'}
        </p>
        <Link to="/subscription" className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">
          Go to Subscription →
        </Link>
      </div>
    </div>
  );
}
