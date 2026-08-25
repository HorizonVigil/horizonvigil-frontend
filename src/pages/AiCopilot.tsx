import { useEffect, useRef, useState } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../lib/toast';
import { api, friendlyErrorMessage, type ConversationSummary, type ChatMessage, type ChatSource } from '../lib/api';
import { renderMarkdownLite } from '../lib/chatMarkdown';

function SourceTags({ sources }: { sources: ChatSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {sources.map((s, i) => (
        <span key={i} title={s.summary} className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
          {s.type.replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  );
}

export function AiCopilot() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    try {
      const res = await api.getConversations();
      setConversations(res.items);
    } catch (err) {
      const message = friendlyErrorMessage(err, 'Failed to load conversations.');
      setError(message);
      toast(message, 'error');
    }
  }

  useEffect(() => { void loadConversations(); }, []);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    api.getConversationMessages(activeId)
      .then((res) => setMessages(res.items))
      .catch((err) => {
        const message = friendlyErrorMessage(err, 'Failed to load this conversation.');
        setError(message);
        toast(message, 'error');
      });
  }, [activeId, toast]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const message = input.trim();
    if (!message || sending) return;
    setInput('');
    setError(null);
    setSending(true);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', content: message, sources: [], created_at: new Date().toISOString() }]);
    try {
      const reply = await api.sendChatMessage({ conversationId: activeId ?? undefined, message });
      setActiveId(reply.conversationId);
      setMessages((prev) => [...prev, { id: `local-${Date.now()}-a`, role: 'assistant', content: reply.message, sources: reply.sources, created_at: new Date().toISOString() }]);
      await loadConversations();
    } catch (err) {
      setError((err as Error).message || 'The AI Copilot is unavailable right now.');
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await api.deleteConversation(id);
    if (activeId === id) setActiveId(null);
    await loadConversations();
  }

  async function handlePin(id: string, pinned: boolean, e: React.MouseEvent) {
    e.stopPropagation();
    await api.pinConversation(id, !pinned);
    await loadConversations();
  }

  async function handleRenameSubmit(id: string) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title || title === conversations.find((c) => c.id === id)?.title) return;
    try {
      await api.renameConversation(id, title);
      await loadConversations();
    } catch (err) {
      toast(friendlyErrorMessage(err, 'Failed to rename conversation.'), 'error');
    }
  }

  return (
    <div>
      <FilterBar title="AI Copilot" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 h-[calc(100vh-160px)]">
        <div className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <button
            onClick={() => { setActiveId(null); setMessages([]); }}
            className="m-2 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2"
          >
            + New conversation
          </button>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {conversations.length === 0 && <p className="text-xs text-slate-400 px-2 py-4">No conversations yet.</p>}
            {conversations.map((c) => (
              renamingId === c.id ? (
                <input
                  key={c.id}
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => void handleRenameSubmit(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void handleRenameSubmit(c.id); }
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  className="w-full rounded-md px-2 py-2 mb-1 text-sm border border-brand-400 dark:border-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              ) : (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-left rounded-md px-2 py-2 mb-1 text-sm group flex items-center justify-between gap-1 ${activeId === c.id ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  <span className="truncate flex-1">{c.pinned ? '📌 ' : ''}{c.title}</span>
                  <span className="hidden group-hover:flex items-center gap-1 shrink-0">
                    <span onClick={(e) => { e.stopPropagation(); setRenamingId(c.id); setRenameValue(c.title); }} className="text-slate-300 hover:text-brand-500 text-xs" title="Rename">✎</span>
                    <span onClick={(e) => void handlePin(c.id, c.pinned, e)} className="text-slate-300 hover:text-brand-500 text-xs" title={c.pinned ? 'Unpin' : 'Pin'}>📌</span>
                    <span onClick={(e) => void handleDelete(c.id, e)} className="text-slate-300 hover:text-red-500 text-xs" title="Delete">✕</span>
                  </span>
                </button>
              )
            ))}
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <EmptyState
                icon="sparkles"
                title="Ask about your cloud infrastructure"
                description="Cost, security findings, Kubernetes clusters, resources — the Copilot fetches live HorizonVigil data for whatever you ask, scoped to what you're allowed to see."
              />
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-2 ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`}>
                    {m.role === 'user' ? <p className="text-sm whitespace-pre-wrap">{m.content}</p> : renderMarkdownLite(m.content)}
                    {m.role === 'assistant' && <SourceTags sources={m.sources} />}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-400 text-sm">Thinking… (CPU-served model, this can take a while)</div>
              </div>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder="Ask about cost, security, Kubernetes, resources…"
              disabled={sending}
              className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white disabled:opacity-60"
            />
            <button
              onClick={() => void handleSend()}
              disabled={sending || !input.trim()}
              className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
