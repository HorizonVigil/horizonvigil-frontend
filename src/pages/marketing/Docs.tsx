import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const DOCS_URL = import.meta.env.VITE_DOCS_URL || 'https://horizonvigil-docs-153395452624.asia-south1.run.app';

/** Authenticated handoff to the separately deployed documentation service. */
export function Docs() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      const token = data.session?.access_token;
      if (sessionError || !token) {
        setError('Your session could not be verified. Sign in again to open documentation.');
        return;
      }
      // Fragments are not sent with HTTP requests. The docs shell moves the
      // token to sessionStorage and removes the fragment before API access.
      window.location.replace(`${DOCS_URL}/#access_token=${encodeURIComponent(token)}`);
    });
    return () => { active = false; };
  }, []);

  return (
    <section className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">Protected documentation</p>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">Opening HorizonVigil Docs</h1>
      {error ? <><p role="alert" className="mt-4 text-sm text-rose-600 dark:text-rose-300">{error}</p><Link to="/login" className="mt-5 inline-flex rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Sign in</Link></> : <p role="status" className="mt-4 text-sm text-slate-500 dark:text-slate-400">Verifying your session…</p>}
    </section>
  );
}
