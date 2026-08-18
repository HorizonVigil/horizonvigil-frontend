import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { CONTACT_SALES_HREF, BOOK_DEMO_HREF } from '../../lib/marketingContent';
import { scrollToSection } from '../../lib/scrollToSection';

// Same fix as MarketingNav's handleSectionLinkClick -- see that component
// for why these render as plain <a> tags, not <Link>.
function handleSectionLinkClick(e: React.MouseEvent, id: string) {
  if (window.location.pathname !== '/') return;
  e.preventDefault();
  if (scrollToSection(id)) {
    window.history.pushState(null, '', `/#${id}`);
  }
}

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean; section?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Platform', href: '/#platform', section: true },
      { label: 'Security', href: '/#security', section: true },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Documentation', href: '/docs' },
      // No status-page service is wired up yet (nothing in marketingContent.ts
      // or the env-style API URL constants points at one) -- this is a
      // placeholder path, not a real status page. See navConfig.ts's
      // real:false convention for the equivalent "planned, not built" signal
      // on in-app nav; there's no such route here yet, so this just links
      // through rather than rendering a disabled item.
      { label: 'Status', href: '/status' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { label: 'Start free', href: '/signup' },
      { label: 'Log in', href: '/login' },
      { label: 'Book a demo', href: BOOK_DEMO_HREF, external: true },
      { label: 'Contact sales', href: CONTACT_SALES_HREF, external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-5 py-14 grid grid-cols-2 md:grid-cols-5 gap-10">
        <div className="col-span-2">
          <Logo />
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 max-w-xs">
            One control plane for AWS and GCP — inventory, cost, security, and automated remediation.
          </p>
        </div>
        {COLUMNS.map(col => (
          <div key={col.title}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">{col.title}</div>
            <ul className="flex flex-col gap-2.5">
              {col.links.map(l => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">{l.label}</a>
                  ) : l.section ? (
                    <a href={l.href} onClick={e => handleSectionLinkClick(e, l.href.slice(2))} className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">{l.label}</a>
                  ) : (
                    <Link to={l.href} className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-5 py-5 text-xs text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} HorizonVigil. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
