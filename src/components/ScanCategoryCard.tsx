import { Link } from 'react-router-dom';
import { Icon, type IconName } from './icons';

/**
 * One tile in Security Scanning Center's category grid. Used only there --
 * factored out purely to keep that page's file from becoming unwieldy with
 * 11 near-identical card blocks, matching this codebase's convention of
 * small focused components over one giant page render.
 */
export function ScanCategoryCard({
  icon,
  title,
  description,
  scanners,
  statuses,
  href,
  ctaLabel = 'Open',
}: {
  icon: IconName;
  title: string;
  description: string;
  /** Real scanner name(s) backing this category (e.g. ['Semgrep']). Omitted/empty = nothing connected yet -- renders an honest "Not yet connected" state instead of a fake chip. */
  scanners?: string[];
  /** scanner name -> reachable, from api.getScannerStatuses(). */
  statuses?: Record<string, boolean>;
  href: string;
  ctaLabel?: string;
}) {
  const connected = (scanners?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
          <Icon name={icon} size={18} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{title}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {connected ? (
          scanners!.map(name => {
            const reachable = statuses?.[name];
            return (
              <span key={name} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    reachable === undefined ? 'bg-slate-300 dark:bg-slate-600' : reachable ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                  aria-hidden="true"
                />
                {name}
              </span>
            );
          })
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
            Not yet connected
          </span>
        )}
      </div>

      <Link
        to={href}
        className="self-start mt-auto text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
      >
        {ctaLabel} →
      </Link>
    </div>
  );
}
