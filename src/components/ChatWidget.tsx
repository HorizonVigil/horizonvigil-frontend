import { useState, useEffect } from 'react';

/**
 * chat-api (rule-based intent Q&A + Workers AI fallback) is not part of the
 * 15-domain backend rebuild — see docs/about-project.md. Rather than call a
 * dead endpoint and show a generic network-error message, this widget is
 * honest about the feature not existing in this build yet. The floating
 * button and "AI Copilot" sidebar entries (navConfig.ts, action:'open-chat')
 * still work — they just open this notice instead of a live conversation.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openChat = () => setOpen(true);
    window.addEventListener('cloudops:open-chat', openChat);
    return () => window.removeEventListener('cloudops:open-chat', openChat);
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="mb-3 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">CloudOps360 Assistant</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none">×</button>
          </div>
          <div className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400">
            The conversational assistant isn't part of this build — it needs its own backend service that wasn't rebuilt alongside the 15 domain APIs. Ask about your accounts, resources, cost, and findings directly from their respective pages for now.
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        className="h-12 w-12 rounded-full bg-brand-600 text-white shadow-lg flex items-center justify-center hover:bg-brand-700"
        aria-label="Open chat assistant"
      >
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    </div>
  );
}
