import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type OwnershipCoverage, type OwnershipRule, type OwnershipRuleRun, type OwnershipRelation } from '../../lib/api';
import { useMenuPermission } from '../../lib/useMenuPermission';

/**
 * AWS-20 — resource ownership.
 *
 * The backend has had five ownership endpoints for a while and nothing in the
 * product called them. Coverage sat at 0% across 515 real assets with zero
 * rules, and a customer had no way in the product to change either.
 *
 * WHY DIRECT ASSIGNMENT IS FIRST, AND TAG RULES SECOND
 *
 * Measured on this estate: 9 of 1,799 resources carry ANY tag, and zero carry
 * an owner tag. A tag-inference engine resolves nothing here. So the panel
 * leads with what works today — a person stating who owns something — and
 * offers rules as the path for customers who already tag.
 *
 * Coverage is the deliverable rather than a decoration: "none of your 515
 * resources have an owner yet" is actionable, while the word "Unassigned"
 * repeated 515 times hides exactly that.
 */

const RELATIONS: OwnershipRelation[] = ['owner', 'team', 'application'];

function CoverageBar({ percent }: { percent: number }) {
  return (
    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800">
      <div
        className={`h-1.5 rounded-full ${percent === 0 ? 'bg-slate-300 dark:bg-slate-700' : 'bg-brand-500'}`}
        style={{ width: `${Math.max(percent, percent === 0 ? 0 : 2)}%` }}
      />
    </div>
  );
}

export function OwnershipPanel() {
  const [coverage, setCoverage] = useState<OwnershipCoverage | null>(null);
  const [rules, setRules] = useState<OwnershipRule[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newRule, setNewRule] = useState<{ relation: OwnershipRelation; tagKey: string }>({ relation: 'owner', tagKey: '' });

  /*
   * Every mutation below goes to a route guarded by
   * requireMenuPermission(db, user, org, 'resources', 'write'). Without this
   * check a viewer saw "Add rule" and "Apply rules" as ordinary enabled
   * controls, clicked one, and got a permission error -- the product offering
   * an action the server was always going to refuse.
   */
  const canWrite = useMenuPermission('resources', 'write');

  const load = useCallback(async () => {
    // Settled, not all: a failing rules list must not blank the coverage
    // figures, which are the part a customer acts on.
    const [c, r] = await Promise.allSettled([api.getOwnershipCoverage(), api.getOwnershipRules()]);
    setCoverage(c.status === 'fulfilled' ? c.value : null);
    setLoadFailed(c.status === 'rejected');
    if (r.status === 'fulfilled') setRules(r.value.items);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<OwnershipRuleRun | unknown>, describe: (r: never) => string) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await fn();
      setMessage(describe(result as never));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The request could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const addRule = () => {
    if (!newRule.tagKey.trim()) return;
    void run(
      () => api.createOwnershipRule({ relation: newRule.relation, tagKey: newRule.tagKey.trim() }),
      () => `Rule added. It applies on the next run — existing assignments are untouched until then.`,
    ).then(() => setNewRule({ relation: 'owner', tagKey: '' }));
  };

  const applyRules = () => void run(
    () => api.applyOwnershipRules(),
    // The server explains a zero, so it is shown rather than replaced with a
    // generic "0 assignments" that looks like a broken job.
    (r: OwnershipRuleRun) => r.explanation,
  );

  const removeRule = (id: string) => void run(
    () => api.deleteOwnershipRule(id),
    (r: { assignmentsRetained: number }) =>
      // Deleting a rule means "stop applying it", not "forget who owns these".
      `Rule removed. ${r.assignmentsRetained} existing assignment(s) were kept — removing a rule stops it applying, it does not unassign anyone.`,
  );

  if (loadFailed) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-50">Ownership</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Ownership coverage could not be loaded, so nothing here has been measured.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-50">Ownership</h3>
        {coverage && (
          <span className="text-xs text-slate-500">
            measured against {coverage.totalAssets.toLocaleString()} real assets
          </span>
        )}
      </div>

      {coverage && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {coverage.ownership.map((m) => (
            <div key={m.relation}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium capitalize text-slate-700 dark:text-slate-300">{m.relation}</span>
                {/* Floored, never rounded up: rounding 9 of 1,799 to 1% would
                    imply something is working. */}
                <span className="text-xs text-slate-500">{m.percent}%</span>
              </div>
              <CoverageBar percent={m.percent} />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{m.explanation}</p>
            </div>
          ))}
        </div>
      )}

      {coverage && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{coverage.iac.explanation}</p>
      )}

      <div className="mt-4 border-t border-slate-200 dark:border-slate-800 pt-3">
        {!canWrite && (
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            You have read-only access to resources, so ownership rules can be
            viewed but not changed.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600 dark:text-slate-400">
            <span className="block mb-1">Relation</span>
            <select
              value={newRule.relation}
              onChange={(e) => setNewRule((r) => ({ ...r, relation: e.target.value as OwnershipRelation }))}
              disabled={!canWrite}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
            >
              {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600 dark:text-slate-400 flex-1 min-w-[10rem]">
            <span className="block mb-1">Tag key to read it from</span>
            <input
              value={newRule.tagKey}
              onChange={(e) => setNewRule((r) => ({ ...r, tagKey: e.target.value }))}
              disabled={!canWrite}
              placeholder="e.g. Owner"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
            />
          </label>
          <button type="button" onClick={addRule} disabled={!canWrite || busy || !newRule.tagKey.trim()}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm disabled:opacity-50">
            Add rule
          </button>
          <button type="button" onClick={applyRules} disabled={!canWrite || busy || rules.length === 0}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? 'Working…' : 'Apply rules'}
          </button>
        </div>

        {rules.length > 0 && (
          <ul className="mt-3 space-y-1">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-700 dark:text-slate-300">
                  <span className="capitalize">{r.relation}</span> from tag <span className="font-mono">{r.tag_key}</span>
                </span>
                <button type="button" onClick={() => removeRule(r.id)} disabled={!canWrite || busy}
                  className="text-slate-500 hover:text-rose-600 disabled:opacity-50">Remove</button>
              </li>
            ))}
          </ul>
        )}

        {message && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{message}</p>}
        {error && <p className="mt-2 text-xs text-rose-700 dark:text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
