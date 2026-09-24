/**
 * Comment stripping for the source-level regression guards.
 *
 * Several suites assert contracts against raw source text: that a removed
 * control is still removed, that a gate is still applied at its call site.
 * Those assertions have to read CODE. A comment explaining why something was
 * removed contains the very words the negative assertion forbids, so without
 * stripping, documenting a removal re-breaks its own guard.
 *
 * WHY THIS LIVES IN ONE PLACE
 *
 * Six suites had grown their own copy of this scanner, in four different
 * versions. One of those versions is why this file exists: `CloudAccounts.tsx`
 * gained the JSX prose "Couldn't load the latest account list", and a scanner
 * that treats every `'` as a string delimiter read that apostrophe as the
 * start of a string literal. It then stayed "inside" that string for the rest
 * of the file, so every later comment survived stripping — including the one
 * recording that bulk permanent delete had been removed. The guard reported
 * the deletion control as present. It was not present; the comment was.
 *
 * THE RULE THAT FIXES IT
 *
 * A JavaScript single- or double-quoted string cannot contain a raw newline —
 * only a template literal can. So reaching a newline while apparently inside
 * one is proof the quote was not a string delimiter at all, and the scanner
 * resynchronises there instead of consuming the rest of the file. That bounds
 * the blast radius of any mis-read quote to a single line.
 *
 * This is deliberately not a JavaScript parser. It preserves string and
 * template contents verbatim (assertions match against them) and only removes
 * comments, which is what these contracts need. It does not track JSX context
 * or regex literals.
 */

type ScanState = 'code' | 'single' | 'double' | 'template';

export function stripComments(text: string): string {
  let result = '';
  let index = 0;
  let state: ScanState = 'code';

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    if (state === 'code') {
      // Block comment, including the JSX `{/* ... */}` form.
      if (char === '/' && next === '*') {
        const end = text.indexOf('*/', index + 2);
        if (end === -1) break;
        // Keep newlines so line-oriented assertions still see line breaks.
        result += text.slice(index, end + 2).replace(/[^\n]/g, ' ');
        index = end + 2;
        continue;
      }

      // Line comment. `https://...` inside a string never reaches here,
      // because a string is handled by the branches below.
      if (char === '/' && next === '/') {
        const end = text.indexOf('\n', index + 2);
        if (end === -1) break;
        result += '\n';
        index = end + 1;
        continue;
      }

      if (char === "'") state = 'single';
      else if (char === '"') state = 'double';
      else if (char === '`') state = 'template';

      result += char;
      index += 1;
      continue;
    }

    // Inside a string or template literal.
    result += char;

    // An escape consumes the next character, so `\'` does not close a string.
    if (char === '\\' && text[index + 1] !== undefined) {
      result += text[index + 1];
      index += 2;
      continue;
    }

    if (
      (state === 'single' && char === "'") ||
      (state === 'double' && char === '"') ||
      (state === 'template' && char === '`')
    ) {
      state = 'code';
    } else if (char === '\n' && state !== 'template') {
      // Resynchronise: a real single/double-quoted string cannot span lines,
      // so this quote was JSX text (an apostrophe) or similar, not a literal.
      state = 'code';
    }

    index += 1;
  }

  return result;
}
