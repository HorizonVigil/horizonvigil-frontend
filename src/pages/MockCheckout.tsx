import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';

/**
 * Test-only hosted checkout screen.
 *
 * Production rules:
 * - This UI never activates a subscription directly.
 * - The backend is the source of truth for plan, price, currency, eligibility,
 *   provider configuration, and activation.
 * - The query-string values are display/input hints only and must never be
 *   trusted for billing or authorization.
 * - The real payment provider should replace this route before production
 *   payments are enabled.
 */
export function MockCheckout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const checkout = useMemo(() => {
    const planKey = (params.get('planKey') ?? '').trim();
    const rawInterval = params.get('billingInterval');
    const billingInterval: 'monthly' | 'annual' =
      rawInterval === 'annual' ? 'annual' : 'monthly';

    const rawPriceCents = params.get('priceCents');
    const parsedPriceCents =
      rawPriceCents === null ? NaN : Number(rawPriceCents);

    const priceCents =
      Number.isSafeInteger(parsedPriceCents) && parsedPriceCents >= 0
        ? parsedPriceCents
        : null;

    const rawCurrency = (params.get('currency') ?? 'USD')
      .trim()
      .toUpperCase();

    const currency = /^[A-Z]{3}$/.test(rawCurrency)
      ? rawCurrency
      : 'USD';

    const planName = planKey
      ? `${planKey[0].toUpperCase()}${planKey.slice(1)}`
      : 'Selected plan';

    let formattedPrice = 'Price unavailable';

    if (priceCents !== null) {
      try {
        formattedPrice = new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency,
          maximumFractionDigits: 0,
        }).format(priceCents / 100);
      } catch {
        formattedPrice = 'Price unavailable';
      }
    }

    return {
      planKey,
      billingInterval,
      priceCents,
      currency,
      planName,
      formattedPrice,
      valid: Boolean(planKey) && priceCents !== null,
    };
  }, [params]);

  async function complete(outcome: 'success' | 'failure') {
    if (processing || !checkout.valid) return;

    setProcessing(true);
    setError(null);

    try {
      /*
       * IMPORTANT:
       * The backend must NOT trust planKey, billingInterval, priceCents, or
       * currency from this browser request. It must resolve the plan and
       * current price server-side and verify that the mock provider is still
       * enabled before activating anything.
       */
      const result = await api.mockCompleteCheckout({
        planKey: checkout.planKey,
        billingInterval: checkout.billingInterval,
        outcome,
      });

      if (!mountedRef.current) return;

      if (result.activated) {
        navigate('/billing/success', { replace: true });
      } else {
        navigate('/billing/canceled', { replace: true });
      }
    } catch (err) {
      if (!mountedRef.current) return;

      const message =
        err instanceof Error
          ? err.message
          : 'Mock checkout failed. Please try again.';

      setError(message);
      toast(message, 'error');
      setProcessing(false);
    }
  }

  if (!checkout.valid) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div
          role="alert"
          className="w-full max-w-sm rounded-xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 p-6 text-center shadow-sm"
        >
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-bold">
            !
          </div>

          <h1 className="text-sm font-semibold text-slate-900 dark:text-white">
            Invalid checkout session
          </h1>

          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            The selected plan or checkout amount is missing or invalid.
            Please start checkout again from the subscription page.
          </p>

          <button
            type="button"
            onClick={() => navigate('/subscription', { replace: true })}
            className="mt-4 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-3 py-1.5"
          >
            Back to Subscription
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-8">
      <div
        className="w-full max-w-sm rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
        aria-busy={processing}
      >
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-center">
          <span
            className="text-xs font-semibold text-amber-700 dark:text-amber-400 tracking-wide"
            role="status"
          >
            TEST MODE — NO REAL PAYMENT IS PROCESSED
          </span>
        </div>

        <div className="p-6">
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">
            Subscribing to
          </div>

          <div className="text-xl font-bold text-slate-900 dark:text-white mb-1">
            {checkout.planName}
          </div>

          <div className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            {checkout.formattedPrice}
            <span className="text-sm font-normal text-slate-400">
              /{checkout.billingInterval === 'annual' ? 'yr' : 'mo'}
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 mb-4 text-xs leading-5 text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 p-3 mb-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            A real payment gateway is not connected in this environment.
            This screen simulates a successful or failed checkout so the
            subscription flow can be tested end to end.
            <br />
            <br />
            The backend remains the source of truth for subscription
            activation.
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void complete('success')}
              disabled={processing}
              aria-busy={processing}
              className="text-sm font-semibold py-2.5 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white"
            >
              {processing ? 'Processing…' : 'Complete mock payment'}
            </button>

            <button
              type="button"
              onClick={() => void complete('failure')}
              disabled={processing}
              className="text-sm font-medium py-2.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Simulate failed payment
            </button>

            <button
              type="button"
              onClick={() => navigate('/subscription')}
              disabled={processing}
              className="text-xs font-medium py-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50"
            >
              Back to Subscription
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}