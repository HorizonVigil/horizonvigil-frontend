import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NAV_MODULES } from '../lib/navConfig';

interface Command {
  id: string;
  label: string;
  group: string;
  icon: string;
  to: string;
}

/**
 * Flattened from NAV_MODULES itself, not a separate hand-maintained list —
 * a module/child not marked `real: true` (or with no `to`) genuinely can't
 * be navigated to, so it's excluded rather than offered as a dead result.
 * Module and child entries pointing at the exact same `to` collapse to one
 * command (mirrors navConfig's own isChildActive dedup reasoning).
 */
function buildCommands(): Command[] {
  const commands: Command[] = [];
  const seen = new Set<string>();
  for (const mod of NAV_MODULES) {
    if (mod.to && !seen.has(mod.to)) {
      seen.add(mod.to);
      commands.push({ id: mod.to, label: mod.label, group: mod.label, icon: mod.icon, to: mod.to });
    }
    for (const child of mod.children) {
      if (child.real && child.to && !seen.has(`${mod.label}:${child.to}`)) {
        seen.add(`${mod.label}:${child.to}`);
        commands.push({ id: `${mod.label}:${child.to}`, label: child.label, group: mod.label, icon: mod.icon, to: child.to });
      }
    }
  }
  return commands;
}

const ALL_COMMANDS = buildCommands();

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_COMMANDS.slice(0, 20);
    return ALL_COMMANDS.filter(c => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)).slice(0, 20);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Wait a tick for the modal to mount before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  function go(cmd: Command) {
    navigate(cmd.to);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); const cmd = results[activeIndex]; if (cmd) go(cmd); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Jump to a page…"
            className="flex-1 bg-transparent outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
            aria-label="Search pages"
          />
          <kbd className="text-[10px] rounded border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-slate-400 dark:text-slate-500">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1" role="listbox">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">No matching pages</li>
          ) : (
            results.map((cmd, i) => (
              <li key={cmd.id} role="option" aria-selected={i === activeIndex}>
                <button
                  onClick={() => go(cmd)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm ${
                    i === activeIndex ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span className="w-5 text-center shrink-0" aria-hidden="true">{cmd.icon}</span>
                  <span className="truncate">{cmd.label}</span>
                  {cmd.group !== cmd.label && <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 shrink-0">{cmd.group}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
