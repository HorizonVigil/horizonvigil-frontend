import type { ReactNode } from 'react';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

interface LegalPageProps {
  title: string;
  updated: string;
  children: ReactNode;
}

/**
 * Shared shell for Privacy Policy / Terms of Service pages.
 *
 * Provides:
 * - Consistent marketing navigation and footer
 * - Accessible page heading and main landmark
 * - Responsive readable legal-document layout
 * - Light/dark theme support
 *
 * The component intentionally does not modify or interpret the supplied
 * legal content. Individual legal pages remain responsible for their
 * own sections and wording.
 */
export function LegalPage({
  title,
  updated,
  children,
}: LegalPageProps) {
  const titleId = 'legal-page-title';

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-white flex flex-col">
      <MarketingNav />

      <main
        id="main-content"
        aria-labelledby={titleId}
        className="flex-1 w-full"
      >
        <article className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <header className="mb-10">
            <h1
              id={titleId}
              className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl"
            >
              {title}
            </h1>

            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Last updated{' '}
              <time dateTime={updated}>
                {updated}
              </time>
            </p>
          </header>

          <div
            className={[
              'text-sm leading-7 text-slate-600 dark:text-slate-300',
              '[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold',
              '[&_h2]:leading-7 [&_h2]:text-slate-900',
              'dark:[&_h2]:text-white',
              '[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold',
              '[&_h3]:leading-6 [&_h3]:text-slate-900',
              'dark:[&_h3]:text-slate-100',
              '[&_p]:mb-4',
              '[&_ul]:mb-4 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1',
              '[&_ol]:mb-4 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1',
              '[&_li]:pl-1',
              '[&_a]:font-medium [&_a]:text-slate-900 [&_a]:underline',
              '[&_a]:underline-offset-2',
              'dark:[&_a]:text-white',
              '[&_strong]:font-semibold [&_strong]:text-slate-800',
              'dark:[&_strong]:text-slate-100',
              '[&_blockquote]:my-4 [&_blockquote]:border-l-2',
              '[&_blockquote]:border-slate-300 [&_blockquote]:pl-4',
              'dark:[&_blockquote]:border-slate-700',
            ].join(' ')}
          >
            {children}
          </div>
        </article>
      </main>

      <MarketingFooter />
    </div>
  );
}