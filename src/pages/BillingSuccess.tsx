import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type BillingSubscription } from '../lib/api';
import { Icon } from '../components/icons';

const MAX_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 2000;

/**
 * Landing page after Stripe Checkout.
 *
 * Important:
 * The Stripe redirect is not the source of truth for subscription state.
 * The backend webhook creates/activates the subscription. This page polls
 * the backend briefly because the webhook may arrive after the redirect.
 */
export function BillingSuccess() {
  const [subscription, setSubscription] =
    useState<BillingSubscription | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (cancelled) return;

      attempts += 1;

      try {
        const response = await api.getCurrentSubscription();

        if (cancelled) return;

        if (response.subscription) {
          setSubscription(response.subscription);
          setChecking(false);
          setError(null);
          return;
        }

        // The webhook may not have processed yet.
        if (attempts < MAX_ATTEMPTS) {
          timeoutId = setTimeout(() => {
            void poll();
          }, POLL_INTERVAL_MS);
          return;
        }

        setChecking(false);
        setError(
          'Your payment was completed, but the subscription is still being activated.',
        );
      } catch (err) {
        if (cancelled) return;

        // Transient API failures should continue polling while we still
        // have attempts remaining.
        if (attempts < MAX_ATTEMPTS) {
          timeoutId = setTimeout(() => {
            void poll();
          }, POLL_INTERVAL_MS);
          return;
        }

        setChecking(false);
        setError(
          err instanceof ApiError
            ? err.message
            : 'We could not confirm your subscription yet.',
        );
      }
    };

    void poll();

    return () => {
      cancelled = true;

      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const title = checking
    ? 'Confirming your subscription…'
    : subscription
      ? "You're subscribed"
      : 'Subscription activation in progress';

  const description = checking
    ? 'Your checkout is complete. We’re confirming your plan with our billing system.'
    : subscription
      ? 'Your plan is active and ready to use.'
      : error ??
        'Your subscription is still being activated. Please check your subscription page again shortly.';

  return (
    <main
      className="min-h-[60vh] flex items-center justify-center px-4 py-10"
      aria-labelledby="billing-success-title"
    >
      <section
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800
                   bg-white dark:bg-slate-900 p-6 sm:p-8 text-center shadow-sm"
        role="status"
        aria-live="polite"
      >
        <div
          className={`mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full ${
            subscription
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
          }`}
          aria-hidden="true"
        >
          {checking ? (
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
          ) : subscription ? (
            <Icon name="check" size={22} />
          ) : (
            <Icon name="clock" size={22} />
          )}
        </div>

        <h1
          id="billing-success-title"
          className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white"
        >
          {title}
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {description}
        </p>

        {checking && (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            This usually takes only a few seconds.
          </p>
        )}

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/subscription"
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-md
                       bg-brand-600 px-4 py-2 text-sm font-medium text-white
                       transition-colors hover:bg-brand-700
                       focus:outline-none focus:ring-2 focus:ring-brand-500
                       focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            View Subscription
          </Link>

          <Link
            to="/"
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-md
                       border border-slate-200 dark:border-slate-700
                       px-4 py-2 text-sm font-medium
                       text-slate-700 dark:text-slate-300
                       transition-colors hover:bg-slate-50 dark:hover:bg-slate-800
                       focus:outline-none focus:ring-2 focus:ring-brand-500
                       focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            Go to Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}