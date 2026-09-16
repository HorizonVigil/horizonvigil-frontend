/**
 * Minimal dependency-free Markdown renderer for AI Copilot responses.
 *
 * Supported Markdown:
 * - paragraphs
 * - **bold**
 * - `inline code`
 * - fenced code blocks (``` or ```language)
 * - unordered `-` / `*` lists
 * - ordered `1.` lists
 *
 * This intentionally does NOT parse HTML or arbitrary Markdown. React renders
 * all text as text nodes, so model output cannot inject raw markup through this
 * renderer.
 *
 * Shared by the full /ai-copilot page and the floating ChatWidget so both
 * surfaces render the same response format.
 */
import type { ReactNode } from 'react';

const FENCE_RE = /^```([A-Za-z0-9_-]+)?[ \t]*$/;
const UNORDERED_LIST_RE = /^[-*][ \t]+(.+)$/;
const ORDERED_LIST_RE = /^\d+[.)][ \t]+(.+)$/;

type MarkdownBlock =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'code'; language?: string; content: string };

function splitBlocks(text: string): MarkdownBlock[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];

  let paragraph: string[] = [];
  let listType: 'unordered-list' | 'ordered-list' | null = null;
  let listItems: string[] = [];
  let inFence = false;
  let fenceLanguage: string | undefined;
  let fenceLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;

    blocks.push({
      type: 'paragraph',
      lines: paragraph,
    });

    paragraph = [];
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }

    blocks.push({
      type: listType,
      items: listItems,
    });

    listType = null;
    listItems = [];
  };

  for (const line of lines) {
    const fence = line.match(FENCE_RE);

    if (inFence) {
      if (fence) {
        blocks.push({
          type: 'code',
          language: fenceLanguage,
          content: fenceLines.join('\n'),
        });

        inFence = false;
        fenceLanguage = undefined;
        fenceLines = [];
      } else {
        fenceLines.push(line);
      }

      continue;
    }

    if (fence) {
      flushParagraph();
      flushList();

      inFence = true;
      fenceLanguage = fence[1];
      fenceLines = [];
      continue;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const unordered = trimmed.match(UNORDERED_LIST_RE);
    const ordered = trimmed.match(ORDERED_LIST_RE);

    if (unordered) {
      flushParagraph();

      if (listType !== 'unordered-list') {
        flushList();
        listType = 'unordered-list';
      }

      listItems.push(unordered[1]);
      continue;
    }

    if (ordered) {
      flushParagraph();

      if (listType !== 'ordered-list') {
        flushList();
        listType = 'ordered-list';
      }

      listItems.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (inFence) {
    // Graceful degradation for an unterminated fence: render it as code
    // rather than silently dropping the model's response.
    blocks.push({
      type: 'code',
      language: fenceLanguage,
      content: fenceLines.join('\n'),
    });
  } else {
    flushParagraph();
    flushList();
  }

  return blocks;
}

/**
 * Render the supported block-level Markdown without ever using dangerouslySetInnerHTML.
 */
export function renderMarkdownLite(text: string): ReactNode[] {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  return splitBlocks(text).map((block, index) => {
    switch (block.type) {
      case 'code':
        return (
          <pre
            key={`code-${index}`}
            className="my-2 overflow-x-auto rounded-md bg-slate-100 p-3 text-xs dark:bg-slate-800"
            aria-label={
              block.language
                ? `Code block (${block.language})`
                : 'Code block'
            }
          >
            <code>{block.content}</code>
          </pre>
        );

      case 'unordered-list':
        return (
          <ul
            key={`ul-${index}`}
            className="my-2 list-disc space-y-1 pl-5 text-sm"
          >
            {block.items.map((item, itemIndex) => (
              <li key={`ul-${index}-${itemIndex}`}>
                {renderInline(item)}
              </li>
            ))}
          </ul>
        );

      case 'ordered-list':
        return (
          <ol
            key={`ol-${index}`}
            className="my-2 list-decimal space-y-1 pl-5 text-sm"
          >
            {block.items.map((item, itemIndex) => (
              <li key={`ol-${index}-${itemIndex}`}>
                {renderInline(item)}
              </li>
            ))}
          </ol>
        );

      case 'paragraph':
        return (
          <p
            key={`p-${index}`}
            className="my-2 whitespace-pre-wrap text-sm leading-relaxed"
          >
            {renderInline(block.lines.join('\n'))}
          </p>
        );
    }
  });
}

/**
 * Render the supported inline Markdown.
 *
 * Parsing is deliberately narrow. HTML, links, images, headings, tables,
 * entities, and arbitrary Markdown extensions are left as literal text.
 */
export function renderInline(text: string): ReactNode[] {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  const output: ReactNode[] = [];
  let cursor = 0;
  let partIndex = 0;

  while (cursor < text.length) {
    const nextBold = text.indexOf('**', cursor);
    const nextCode = text.indexOf('`', cursor);

    const candidates = [
      nextBold === -1 ? Number.POSITIVE_INFINITY : nextBold,
      nextCode === -1 ? Number.POSITIVE_INFINITY : nextCode,
    ];

    const nextStart = Math.min(...candidates);

    if (nextStart === Number.POSITIVE_INFINITY) {
      output.push(
        <span key={`text-${partIndex++}`}>{text.slice(cursor)}</span>,
      );
      break;
    }

    if (nextStart > cursor) {
      output.push(
        <span key={`text-${partIndex++}`}>
          {text.slice(cursor, nextStart)}
        </span>,
      );
    }

    if (nextStart === nextBold) {
      const end = text.indexOf('**', nextStart + 2);

      if (end === -1) {
        output.push(
          <span key={`text-${partIndex++}`}>
            {text.slice(nextStart)}
          </span>,
        );
        break;
      }

      const value = text.slice(nextStart + 2, end);

      if (value.length === 0) {
        output.push(
          <span key={`text-${partIndex++}`}>****</span>,
        );
      } else {
        output.push(
          <strong key={`bold-${partIndex++}`}>{value}</strong>,
        );
      }

      cursor = end + 2;
      continue;
    }

    const end = text.indexOf('`', nextStart + 1);

    if (end === -1) {
      output.push(
        <span key={`text-${partIndex++}`}>
          {text.slice(nextStart)}
        </span>,
      );
      break;
    }

    const value = text.slice(nextStart + 1, end);

    if (value.length === 0) {
      output.push(
        <span key={`text-${partIndex++}`}>``</span>,
      );
    } else {
      output.push(
        <code
          key={`code-${partIndex++}`}
          className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800"
        >
          {value}
        </code>,
      );
    }

    cursor = end + 1;
  }

  return output;
}
