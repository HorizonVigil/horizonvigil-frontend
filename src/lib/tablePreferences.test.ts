import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useTablePreferences } from './tablePreferences';

/**
 * Table preferences are a display convenience, so the bar is: they persist
 * when they can, and they never take a page down when they cannot.
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('useTablePreferences', () => {
  it('starts comfortable and honours the table default hidden columns', () => {
    const { result } = renderHook(() => useTablePreferences('t1', ['cost']));

    expect(result.current.density).toBe('comfortable');
    expect(result.current.hiddenColumns.has('cost')).toBe(true);
  });

  it('persists density across remounts', () => {
    const first = renderHook(() => useTablePreferences('t2'));

    act(() => first.result.current.setDensity('compact'));
    first.unmount();

    const second = renderHook(() => useTablePreferences('t2'));

    expect(second.result.current.density).toBe('compact');
  });

  it('persists column visibility across remounts', () => {
    const first = renderHook(() => useTablePreferences('t3'));

    act(() => first.result.current.toggleColumn('region'));
    expect(first.result.current.hiddenColumns.has('region')).toBe(true);
    first.unmount();

    const second = renderHook(() => useTablePreferences('t3'));

    expect(second.result.current.hiddenColumns.has('region')).toBe(true);
  });

  it('keeps preferences separate per table id', () => {
    const a = renderHook(() => useTablePreferences('table-a'));

    act(() => a.result.current.setDensity('compact'));

    const b = renderHook(() => useTablePreferences('table-b'));

    expect(b.result.current.density).toBe('comfortable');
  });

  it('saves, applies and deletes a view', () => {
    const { result } = renderHook(() => useTablePreferences('t4'));

    act(() => {
      result.current.toggleColumn('owner');
      result.current.setDensity('compact');
      result.current.saveView('Ops triage');
    });

    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].name).toBe('Ops triage');

    // Move away from the saved state, then come back to it.
    act(() => {
      result.current.toggleColumn('owner');
      result.current.setDensity('comfortable');
    });

    expect(result.current.hiddenColumns.has('owner')).toBe(false);

    act(() => {
      result.current.applyView(result.current.views[0].id);
    });

    expect(result.current.hiddenColumns.has('owner')).toBe(true);
    expect(result.current.density).toBe('compact');

    act(() => result.current.deleteView(result.current.views[0].id));

    expect(result.current.views).toHaveLength(0);
  });

  /** Saving over a name replaces it — two views a user cannot tell apart is worse. */
  it('replaces a view saved under an existing name', () => {
    const { result } = renderHook(() => useTablePreferences('t5'));

    act(() => result.current.saveView('Daily'));
    act(() => result.current.saveView('Daily'));

    expect(result.current.views).toHaveLength(1);
  });

  it('ignores a blank view name', () => {
    const { result } = renderHook(() => useTablePreferences('t6'));

    act(() => result.current.saveView('   '));

    expect(result.current.views).toHaveLength(0);
  });

  /**
   * localStorage throws in private mode and wherever site data is blocked. A
   * column preference must never be the reason a page fails to render.
   */
  it('falls back to defaults when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const { result } = renderHook(() => useTablePreferences('t7'));

    expect(result.current.density).toBe('comfortable');
    expect(() => act(() => result.current.setDensity('compact'))).not.toThrow();
  });

  it('degrades to defaults on malformed stored data', () => {
    window.localStorage.setItem('hv.table.t8', '{not json');

    const { result } = renderHook(() => useTablePreferences('t8'));

    expect(result.current.density).toBe('comfortable');
    expect(result.current.views).toEqual([]);
  });

  it('discards stored views that do not match the expected shape', () => {
    window.localStorage.setItem(
      'hv.table.t9',
      JSON.stringify({
        density: 'compact',
        hiddenColumns: ['a'],
        views: [{ nope: true }, { id: 'x', name: 'Good', hiddenColumns: [], density: 'compact' }],
      }),
    );

    const { result } = renderHook(() => useTablePreferences('t9'));

    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].name).toBe('Good');
  });
});
