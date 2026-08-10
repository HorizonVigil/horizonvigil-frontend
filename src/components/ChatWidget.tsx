import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, type ChatMessage } from '../lib/api';

/** Same minimal markdown renderer as the full AI Copilot page (pages/AiCopilot.tsx) — kept as a local copy since this widget's compact layout doesn't share enough else with that page to justify extracting a shared module yet. */
function renderMarkdownLite(text: string) {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, i) => {
    if (block.startsWith('```')) {
      const code = block.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '');
      return <pre key={i} className="rounded-md bg-slate-100 dark:bg-slate-800 p-2 text-[11px] overflow-x-auto my-1.5"><code>{code}</code></pre>;
    }
    return <p key={i} className="text-xs leading-relaxed my-1.5 whitespace-pre-wrap">{block}</p>;
  });
}

/**
 * Now backed by cloudops-ai-gateway (built alongside the full AI Copilot
 * page at pages/AiCopilot.tsx) — previously an honest "not implemented"
 * placeholder, since chat-api never got rebuilt with the other 15 domain
 * services. This widget keeps a single conversation for the session (no
 * conversation switcher — that's what the full /ai-copilot page is for);
 * it just resumes the same thread while open/reopened, and starts fresh on
 * a full page reload.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const openChat = () => setOpen(true);
    window.addEventListener('cloudops:open-chat', openChat);
    return () => window.removeEventListener('cloudops:open-chat', openChat);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  async function handleSend() {
    const message = input.trim();
    if (!message || sending) return;
    setInput('');
    setError(null);
    setSending(true);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', content: message, sources: [], created_at: new Date().toISOString() }]);
    try {
      const reply = await api.sendChatMessage({ conversationId: conversationId ?? undefined, message });
      setConversationId(reply.conversationId);
      setMessages((prev) => [...prev, { id: `local-${Date.now()}-a`, role: 'assistant', content: reply.message, sources: reply.sources, created_at: new Date().toISOString() }]);
    } catch (err) {
      setError((err as Error).message || 'The AI Copilot is unavailable right now.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="mb-3 w-80 sm:w-96 h-[28rem] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 shrink-0">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">CloudOps360 Assistant</span>
            <div className="flex items-center gap-2">
              <Link to="/ai-copilot" className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline">Full view</Link>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none">×</button>
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-slate-400 py-4">Ask about your cost, security findings, resources, or Kubernetes clusters.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-1.5 ${m.role === 'user' ? 'bg-brand-600 text-white text-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`}>
                  {m.role === 'user' ? <p className="text-xs">{m.content}</p> : renderMarkdownLite(m.content)}
                </div>
              </div>
            ))}
            {sending && <div className="text-xs text-slate-400 px-1">Thinking…</div>}
            {error && <p className="text-xs text-red-500 px-1">{error}</p>}
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 p-2 flex gap-1.5 shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder="Ask a question…"
              disabled={sending}
              className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-900 dark:text-white disabled:opacity-60"
            />
            <button
              onClick={() => void handleSend()}
              disabled={sending || !input.trim()}
              className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5"
            >
              Send
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
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
