import type { ReactNode } from 'react';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-xl font-semibold text-slate-900 dark:text-white">CloudOps360</div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">One login, every AWS and GCP account.</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

export function FormField({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <input {...props} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400" />
    </label>
  );
}
