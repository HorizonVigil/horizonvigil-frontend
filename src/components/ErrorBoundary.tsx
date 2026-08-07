import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Wraps the routed page content (see Layout.tsx) so an uncaught render
 * error in one page shows an in-place message instead of unmounting the
 * entire app — without this, React unmounts the whole tree on any uncaught
 * error, including the sidebar/nav, leaving a blank page with no way to
 * navigate away. Confirmed twice this way in production before this
 * existed: a null passed to .toFixed() in a compliance-benchmark render
 * function blanked the entire app, not just the Vulnerability Management
 * page. This is a safety net, not a substitute for fixing the underlying
 * bug — every render error caught here is still a real bug to go find.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught render error, caught at the page boundary:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <span aria-hidden="true" className="text-2xl text-slate-300 dark:text-slate-600">⚠</span>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">This page hit an unexpected error.</p>
          <p className="max-w-md text-xs text-slate-400 dark:text-slate-500 font-mono break-all">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-1 text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
