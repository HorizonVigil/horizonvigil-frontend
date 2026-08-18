import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { useTheme } from '../../lib/theme';
import { scrollToSection } from '../../lib/scrollToSection';

const SECTION_LINKS = [
  { id: 'platform', label: 'Platform' },
  { id: 'security', label: 'Security' },
];
const PAGE_LINKS = [
  { to: '/pricing', label: 'Pricing' },
  { to: '/docs', label: 'Docs' },
];

/**
 * Two rounds of this bug (both "worked for Platform, not Security", then
 * "worked for neither") traced back to relying on React Router's <Link> --
 * first its own hash-change detection, then (suspected, unconfirmed even
 * after verifying the installed 6.30.4 Link source directly shows the
 * composition *should* work) something about how its onClick composes in
 * production. Rather than chase a third theory about *why* Link isn't
 * cooperating, these two are now plain native <a> tags with no Link/router
 * involvement at all -- nothing left to misbehave.
 *
 * On "/": preventDefault, scroll immediately, update the URL via
 * pushState. Anywhere else: let the browser do a real navigation to
 * "/#id" -- full page load, but Home.tsx's own mount effect (which reads
 * the hash on mount) plus the browser's native initial-load anchor
 * handling both independently pick it up from there.
 */
function handleSectionLinkClick(e: React.MouseEvent, id: string) {
  if (window.location.pathname !== '/') return; // let the native <a> navigate normally
  e.preventDefault();
  if (scrollToSection(id)) {
    window.history.pushState(null, '', `/#${id}`);
  }
}

export function MarketingNav() {
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
        <Logo />

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          {SECTION_LINKS.map(l => (
            <a key={l.id} href={`/#${l.id}`} onClick={e => handleSectionLinkClick(e, l.id)} className="hover:text-slate-900 dark:hover:text-white transition-colors">{l.label}</a>
          ))}
          {PAGE_LINKS.map(l => (
            <Link key={l.label} to={l.to} className="hover:text-slate-900 dark:hover:text-white transition-colors">{l.label}</Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="h-9 w-9 rounded-md flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <Link to="/login" className="text-sm font-medium px-3.5 py-2 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            Log in
          </Link>
          <Link to="/signup" className="text-sm font-semibold px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-700 text-white">
            Start free
          </Link>
        </div>

        <button
          onClick={() => setOpen(o => !o)}
          aria-label="Toggle menu"
          className="md:hidden h-9 w-9 flex flex-col items-center justify-center gap-1"
        >
          <span className="block h-0.5 w-5 bg-slate-700 dark:bg-slate-200" />
          <span className="block h-0.5 w-5 bg-slate-700 dark:bg-slate-200" />
          <span className="block h-0.5 w-5 bg-slate-700 dark:bg-slate-200" />
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 px-5 py-4 flex flex-col gap-3">
          {SECTION_LINKS.map(l => (
            <a key={l.id} href={`/#${l.id}`} onClick={e => { handleSectionLinkClick(e, l.id); setOpen(false); }} className="text-sm font-medium text-slate-700 dark:text-slate-200">{l.label}</a>
          ))}
          {PAGE_LINKS.map(l => (
            <Link key={l.label} to={l.to} onClick={() => setOpen(false)} className="text-sm font-medium text-slate-700 dark:text-slate-200">{l.label}</Link>
          ))}
          <div className="flex gap-2 pt-2">
            <Link to="/login" className="flex-1 text-center text-sm font-medium px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">Log in</Link>
            <Link to="/signup" className="flex-1 text-center text-sm font-semibold px-3.5 py-2 rounded-md bg-brand-600 text-white">Start free</Link>
          </div>
        </div>
      )}
    </header>
  );
}
