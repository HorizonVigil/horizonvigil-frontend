import type { ReactNode } from 'react';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

/** Shared shell for Privacy Policy / Terms of Service — same typographic treatment, different body content. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-950 min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-grow max-w-3xl mx-auto px-5 py-16 w-full">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{title}</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-2 mb-10">Last updated {updated}</p>
        <div className="flex flex-col gap-8 text-sm text-slate-600 dark:text-slate-300 leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:dark:text-white [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
          {children}
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
