import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';

export function BillingCanceled() {
  return (
    <main
      className="min-h-[60vh] flex items-center justify-center px-4 py-10"
      aria-labelledby="billing-canceled-title"
    >
      <section
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800
                   bg-white dark:bg-slate-900 p-6 sm:p-8 text-center shadow-sm"
        role="status"
        aria-live="polite"
      >
        <div
          className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full
                     bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
          aria-hidden="true"
        >
          <Icon name="x" size={22} />
        </div>

        <h1
          id="billing-canceled-title"
          className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white"
        >
          Checkout canceled
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Your checkout was canceled and no charge was made.
          You can choose a plan again whenever you're ready.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/subscription"
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-md
                       bg-brand-600 px-4 py-2 text-sm font-medium text-white
                       transition-colors hover:bg-brand-700
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
                       dark:focus:ring-offset-slate-900"
          >
            Back to Subscription
          </Link>

          <Link
            to="/"
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-md
                       border border-slate-200 dark:border-slate-700
                       px-4 py-2 text-sm font-medium
                       text-slate-700 dark:text-slate-300
                       hover:bg-slate-50 dark:hover:bg-slate-800
                       transition-colors
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
                       dark:focus:ring-offset-slate-900"
          >
            Go to Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}