import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NAV_MODULES } from '../lib/navConfig';
import { isCloudOnlyMode } from '../lib/featureFlags';
import { useGlobalSearch } from '../lib/globalSearch';

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
  const cloudOnly = isCloudOnlyMode();
  for (const mod of NAV_MODULES) {
    // Same render-layer-only skip getVisibleModules() applies for the
    // sidebar -- NAV_MODULES itself (and therefore ProtectedRoute's
    // independent lookup) is untouched, this only keeps a hidden module's
    // ~dozens of children out of Cmd+K search results.
    if (cloudOnly && mod.hiddenInCloudOnlyMode) continue;
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

  // Real-data results alongside page navigation. Only runs while the palette
  // is open, so a closed palette costs nothing.
  const dataSearch = useGlobalSearch(query, open);

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

  /*
   * The palette now renders two sections, so selection spans BOTH. Indices
   * 0..results.length-1 are pages; anything beyond is a data hit. Leaving the
   * bound at results.length-1 would render data results that the keyboard
   * could never reach -- usable with a mouse, invisible without one.
   */
  const selectableCount = results.length + dataSearch.hits.length;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, selectableCount - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return; }

    if (e.key === 'Enter') {
      e.preventDefault();

      if (activeIndex < results.length) {
        const cmd = results[activeIndex];
        if (cmd) go(cmd);
        return;
      }

      const hit = dataSearch.hits[activeIndex - results.length];
      if (hit) { navigate(hit.to); onClose(); }
    }
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
                <button type="button"
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

          {/*
            Data results, from the two search endpoints that actually exist
            (resources and cloud accounts). Their own section, so a page match
            and a resource match are never confused for one another.
          */}
          {dataSearch.loading && (
            <li className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500" aria-live="polite">
              Searching resources and accounts…
            </li>
          )}

          {dataSearch.hits.length > 0 && (
            <li aria-hidden="true" className="mt-1 border-t border-slate-100 dark:border-slate-800 px-4 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Resources &amp; accounts
            </li>
          )}

          {dataSearch.hits.map((hit, i) => {
            const index = results.length + i;

            return (
              <li key={hit.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  onClick={() => { navigate(hit.to); onClose(); }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm ${
                    index === activeIndex ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span className="w-5 shrink-0 text-center text-[10px] uppercase text-slate-400" aria-hidden="true">
                    {hit.kind === 'resource' ? 'RES' : 'ACC'}
                  </span>
                  <span className="truncate">{hit.label}</span>
                  <span className="ml-auto max-w-[45%] shrink-0 truncate text-xs text-slate-400 dark:text-slate-500">{hit.detail}</span>
                </button>
              </li>
            );
          })}

          {/*
            A source that could not be read is NAMED. Dropping it silently
            would render as "no such resource" -- a different, wrong answer.
          */}
          {dataSearch.failedSources.length > 0 && (
            <li className="mt-1 border-t border-slate-100 dark:border-slate-800 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
              Could not search {dataSearch.failedSources.join(' or ')} — those results are missing, not empty.
            </li>
          )}

          {dataSearch.capped && (
            <li className="px-4 pb-2 text-[11px] text-slate-400 dark:text-slate-500">
              Showing the first matches only — refine the search to narrow it.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
