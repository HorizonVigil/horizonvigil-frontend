/**
 * Minimal, dependency-free markdown for the small set of things the AI
 * Copilot model actually produces (paragraphs, **bold**, `code`, ```fenced
 * blocks```, "- "/"1. " lists) — no HTML parsing, so nothing here can inject
 * markup. Shared by the full /ai-copilot page and the floating ChatWidget —
 * previously each had its own copy and the widget's had silently drifted
 * to a version with no bold/code/list handling at all, so widget replies
 * showed raw markdown syntax where the full page rendered it properly.
 */
export function renderMarkdownLite(text: string): React.ReactNode[] {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, i) => {
    if (block.startsWith('```')) {
      const code = block.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '');
      return <pre key={i} className="rounded-md bg-slate-100 dark:bg-slate-800 p-3 text-xs overflow-x-auto my-2"><code>{code}</code></pre>;
    }
    const lines = block.split('\n');
    const isList = lines.every((l) => /^(-|\d+\.)\s/.test(l.trim()) || l.trim() === '');
    if (isList) {
      return (
        <ul key={i} className="list-disc list-inside space-y-1 my-2 text-sm">
          {lines.filter((l) => l.trim()).map((l, j) => <li key={j}>{renderInline(l.replace(/^(-|\d+\.)\s/, ''))}</li>)}
        </ul>
      );
    }
    return <p key={i} className="text-sm leading-relaxed my-2 whitespace-pre-wrap">{renderInline(block)}</p>;
  });
}

export function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-xs">{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}
