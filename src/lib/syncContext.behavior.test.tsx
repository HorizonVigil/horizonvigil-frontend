import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

import { SyncProvider, useSync } from './syncContext';
import { api } from './api';

/**
 * Phase 1 / Phase 3 containment, verified by RUNNING the provider.
 *
 * The properties here -- "only SUCCEEDED counts as done" and "partial
 * progress is never reported as completion" -- were previously asserted by
 * regex against syncContext.tsx's source. Those assertions stopped being able
 * to express the property:
 *
 * - one pinned the exact expression `run.status === 'SUCCEEDED' ? 'done' :
 *   'error'`, so hoisting that comparison into a helper read as the guard
 *   being removed when the behaviour was unchanged; and
 * - the other searched COMPACTED source for `PARTIALLY_SUCCEEDED.*'done'`.
 *   Compacting collapses the file to a single line, so `.*` spans the whole
 *   module: it matched the moment PARTIALLY_SUCCEEDED appeared anywhere --
 *   including in the terminal-status list, where it belongs -- and could
 *   never have shown which state it actually maps to.
 *
 * Driving the provider answers the real question directly, and keeps
 * answering it through any refactor of the file.
 */

function Probe({ connectionId }: { connectionId: string }) {
  const { syncStates, startDiscovery } = useSync();
  const state = syncStates[connectionId];

  return (
    <div>
      <button onClick={() => startDiscovery(connectionId)}>start</button>
      <span data-testid="status">{state?.status ?? 'idle'}</span>
      <span data-testid="error">{state?.error ?? ''}</span>
    </div>
  );
}

function renderProbe(connectionId = 'c-1') {
  return render(
    <SyncProvider>
      <Probe connectionId={connectionId} />
    </SyncProvider>,
  );
}

const PROGRESS = {
  totalSteps: 10,
  completedSteps: 9,
  failedSteps: 1,
  percent: 90,
};

function stubRun(status: string) {
  vi.spyOn(api, 'startCollectionRun').mockResolvedValue({
    id: 'run-1',
    status: 'QUEUED',
    created: true,
    progress: { ...PROGRESS, completedSteps: 0, failedSteps: 0, percent: 0 },
  });

  vi.spyOn(api, 'getCollectionRun').mockResolvedValue({
    id: 'run-1',
    status,
    explanation: '1 of 10 step(s) failed',
    progress: PROGRESS,
    errorSummary: '1 of 10 step(s) failed',
    finishedAt: '2026-09-16T00:00:00Z',
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('browser collection ownership — observed behaviour', () => {
  it('reports SUCCEEDED as done', async () => {
    stubRun('SUCCEEDED');
    renderProbe();

    await act(async () => {
      screen.getByText('start').click();
    });

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('done'),
    );
  });

  /**
   * The load-bearing one. PARTIALLY_SUCCEEDED is a TERMINAL status, so the
   * poll must stop -- but it is not success, and 9 of 10 completed steps must
   * not be presented as a finished collection.
   */
  it('never reports PARTIALLY_SUCCEEDED as done', async () => {
    stubRun('PARTIALLY_SUCCEEDED');
    renderProbe();

    await act(async () => {
      screen.getByText('start').click();
    });

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('error'),
    );

    expect(screen.getByTestId('status').textContent).not.toBe('done');
    expect(screen.getByTestId('error').textContent).toContain('failed');
  });

  it.each(['FAILED', 'CANCELED'])(
    'never reports %s as done',
    async (status) => {
      stubRun(status);
      renderProbe();

      await act(async () => {
        screen.getByText('start').click();
      });

      await waitFor(() =>
        expect(screen.getByTestId('status').textContent).toBe('error'),
      );
    },
  );

  /**
   * Nothing may start collection on its own. The provider only ever calls the
   * server because a person asked it to -- mounting it, and letting timers
   * run, must produce no collection run at all.
   */
  it('starts no collection run without an explicit user action', async () => {
    stubRun('SUCCEEDED');
    vi.useFakeTimers();

    try {
      renderProbe();

      await act(async () => {
        vi.advanceTimersByTime(60 * 60 * 1000);
      });

      expect(api.startCollectionRun).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
