import { useState, useRef, useEffect } from 'react';
import { useFilters } from '../lib/filterContext';
import { api } from '../lib/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  intent?: string;
}

const WELCOME = 'Hi — ask me about your connected AWS accounts, resources, cost, savings recommendations, alarms, or security findings. Most answers come straight from real data with nothing made up; if I can\'t match your question to something I track, I\'ll hand it to a small AI model (clearly marked) grounded in the same data.';

/**
 * A floating assistant available on every page. Most answers come from
 * chat-api's rule-based intent engine — it queries this org's own
 * connections/resources/cost/recommendations and assembles a plain-English
 * answer from real numbers, no LLM involved. Only when nothing matches does
 * it fall back to a small open-weight model (Workers AI), still grounded in
 * the same real data — those replies are labeled so it's clear they came
 * from a generative model rather than a direct lookup.
 */
export function ChatWidget() {
  const { account } = useFilters();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  // Per-module "AI Copilot" sidebar entries (Cost, Monitoring, ...) open this
  // same assistant rather than each having their own — see navConfig.ts.
  useEffect(() => {
    const openChat = () => setOpen(true);
    window.addEventListener('cloudops:open-chat', openChat);
    return () => window.removeEventListener('cloudops:open-chat', openChat);
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text }]);
    setSending(true);
    try {
      const res = await api.sendChatMessage(text, account === 'all' ? undefined : account);
      setMessages(m => [...m, { role: 'assistant', text: res.answer, intent: res.intent }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'Something went wrong reaching the chat service — please try again.' }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="mb-3 w-80 sm:w-96 h-[28rem] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">CloudOps360 Assistant</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none">×</button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
            <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-line bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 self-start max-w-[90%]">{WELCOME}</div>
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-1 max-w-[90%] ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                <div className={`text-xs whitespace-pre-line rounded-lg px-3 py-2 ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>
                  {m.text}
                </div>
                {m.intent === 'ai_fallback' && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 px-1">AI-generated (Workers AI) — verify important numbers on the relevant page</span>
                )}
              </div>
            ))}
            {sending && <div className="text-xs text-slate-400 self-start px-3 py-2">Thinking…</div>}
          </div>
          <div className="flex items-center gap-2 p-2 border-t border-slate-200 dark:border-slate-800">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void send(); }}
              placeholder="Ask about your accounts, resources, cost…"
              className="flex-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-slate-700 dark:text-slate-200"
            />
            <button onClick={() => void send()} disabled={sending || !input.trim()} className="text-xs px-3 py-2 rounded-md bg-brand-600 text-white disabled:opacity-40 hover:bg-brand-700">Send</button>
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
