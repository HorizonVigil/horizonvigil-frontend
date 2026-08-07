import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';

/**
 * Stands in for a real payment gateway's hosted checkout page while
 * payment integration is deferred to a later phase (see mockProvider.ts).
 * Never reachable when a real provider (Stripe/Razorpay) is active --
 * getPaymentProvider() only ever returns a checkoutUrl pointing here when
 * the mock provider is the one configured, and the backend independently
 * refuses to activate anything through /subscriptions/mock-complete
 * unless the mock provider is still active server-side too.
 */
export function MockCheckout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);

  const planKey = params.get('planKey') ?? '';
  const billingInterval = (params.get('billingInterval') === 'annual' ? 'annual' : 'monthly') as 'monthly' | 'annual';
  const priceCents = Number(params.get('priceCents') ?? 0);
  const currency = params.get('currency') ?? 'usd';
  const planName = planKey ? `${planKey[0].toUpperCase()}${planKey.slice(1)}` : 'Selected plan';
  const price = (priceCents / 100).toLocaleString(undefined, { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 });

  async function complete(outcome: 'success' | 'failure') {
    setProcessing(true);
    try {
      const result = await api.mockCompleteCheckout({ planKey, billingInterval, outcome });
      if (result.activated) {
        navigate('/billing/success');
      } else {
        navigate('/billing/canceled');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Mock checkout failed', 'error');
      setProcessing(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-center">
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 tracking-wide">TEST MODE — NO REAL PAYMENT IS PROCESSED</span>
        </div>
        <div className="p-6">
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Subscribing to</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mb-1">{planName}</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            {price}<span className="text-sm font-normal text-slate-400">/{billingInterval === 'annual' ? 'yr' : 'mo'}</span>
          </div>
          <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 p-3 mb-5 text-xs text-slate-500 dark:text-slate-400">
            A real payment gateway isn't connected in this environment yet. This simulates a successful (or failed) checkout so the subscription flow can be tested end to end.
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => complete('success')}
              disabled={processing}
              className="text-sm font-semibold py-2.5 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white"
            >
              {processing ? 'Processing…' : 'Complete mock payment'}
            </button>
            <button
              onClick={() => complete('failure')}
              disabled={processing}
              className="text-sm font-medium py-2.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              Simulate failed payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
