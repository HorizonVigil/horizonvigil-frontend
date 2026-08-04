import { Modal } from './Modal';

/** First step of "+ Add Account" — picks which provider's wizard to open next. Kept as its own tiny modal rather than folding a provider radio into each wizard, since ConnectAwsAccountWizard and ConnectGcpProjectWizard have entirely different fields/steps underneath. */
export function AddAccountChooser({ open, onClose, onChoose }: { open: boolean; onClose: () => void; onChoose: (provider: 'aws' | 'gcp') => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add Cloud Account">
      <div className="flex gap-3">
        <button onClick={() => onChoose('aws')} className="flex-1 text-left rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:border-brand-400 dark:hover:border-brand-500 hover:bg-brand-50/50 dark:hover:bg-brand-900/20">
          <div className="text-2xl mb-2">☁</div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">AWS Account</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Connect via IAM access keys or a cross-account role</div>
        </button>
        <button onClick={() => onChoose('gcp')} className="flex-1 text-left rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:border-brand-400 dark:hover:border-brand-500 hover:bg-brand-50/50 dark:hover:bg-brand-900/20">
          <div className="text-2xl mb-2">🌐</div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">GCP Project</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Connect via a service account key or impersonation</div>
        </button>
        <div className="flex-1 text-left rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-4 opacity-60 cursor-not-allowed" title="On the roadmap — not built yet">
          <div className="text-2xl mb-2">🔷</div>
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400">Azure Subscription</div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Coming soon — not built yet</div>
        </div>
      </div>
    </Modal>
  );
}
