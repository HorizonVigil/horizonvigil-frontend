import { useState, useCallback } from 'react';
import { Modal } from './Modal';

/**
 * Replaces the native `confirm()` popup (unstyled, blocks the whole page,
 * inconsistent with every other confirmation/error surface in the app) with
 * the same Modal component used everywhere else. Usage:
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm('Delete this?'))) return;
 *   // ...render {dialog} once, anywhere in the page's JSX...
 */
export function useConfirm() {
  const [state, setState] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>(resolve => setState({ message, resolve }));
  }, []);

  function resolveWith(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  const dialog = (
    <Modal open={!!state} onClose={() => resolveWith(false)} title="Please confirm">
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{state?.message}</p>
      <div className="flex justify-end gap-2">
        <button onClick={() => resolveWith(false)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
        <button onClick={() => resolveWith(true)} className="text-sm rounded-md bg-red-600 hover:bg-red-700 text-white px-3 py-1.5">Confirm</button>
      </div>
    </Modal>
  );

  return { confirm, dialog };
}
