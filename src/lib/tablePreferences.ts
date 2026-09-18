import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Per-table view preferences: density, column visibility, and saved views.
 *
 * WHY THESE PERSIST LOCALLY RATHER THAN SERVER-SIDE
 *
 * These are per-person display choices, not tenant data. There is no backend
 * contract for them today, and inventing one here would be exactly the kind of
 * fabricated API this codebase avoids. localStorage keeps them real and useful
 * now, and the shape below is deliberately serialisable so a future
 * `GET/PUT /preferences/tables/:id` can adopt it without changing a caller.
 *
 * Nothing here is tenant data, so a viewer on a shared machine leaks nothing
 * beyond their own column choices.
 *
 * READS AND WRITES ARE GUARDED
 *
 * localStorage throws in private mode, in embedded webviews, and when a
 * browser blocks site data. A display preference must never take a page down,
 * so every access is wrapped and falls back to the default.
 */

export type TableDensity = 'comfortable' | 'compact';

export const TABLE_DENSITIES: readonly TableDensity[] = ['comfortable', 'compact'];

export interface SavedTableView {
  id: string;
  name: string;
  /** Columns hidden in this view. */
  hiddenColumns: string[];
  density: TableDensity;
  /** Opaque, caller-owned filter payload (usually the page's URL query). */
  filters?: Record<string, string>;
}

export interface TablePreferences {
  density: TableDensity;
  hiddenColumns: string[];
  views: SavedTableView[];
}

const DEFAULTS: TablePreferences = {
  density: 'comfortable',
  hiddenColumns: [],
  views: [],
};

const STORAGE_PREFIX = 'hv.table.';

function storageKey(tableId: string): string {
  return `${STORAGE_PREFIX}${tableId}`;
}

function isDensity(value: unknown): value is TableDensity {
  return value === 'comfortable' || value === 'compact';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isSavedView(value: unknown): value is SavedTableView {
  if (!value || typeof value !== 'object') return false;

  const v = value as Record<string, unknown>;

  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    isStringArray(v.hiddenColumns) &&
    isDensity(v.density)
  );
}

/**
 * Parsed defensively: stored preferences are just text a previous version of
 * this app (or a person with devtools) wrote. A malformed entry must degrade
 * to defaults, never throw on render.
 */
function parse(raw: string | null): TablePreferences {
  if (!raw) return DEFAULTS;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') return DEFAULTS;

    const p = parsed as Record<string, unknown>;

    return {
      density: isDensity(p.density) ? p.density : DEFAULTS.density,
      hiddenColumns: isStringArray(p.hiddenColumns) ? p.hiddenColumns : [],
      views: Array.isArray(p.views) ? p.views.filter(isSavedView) : [],
    };
  } catch {
    return DEFAULTS;
  }
}

function read(tableId: string): TablePreferences {
  try {
    return parse(window.localStorage.getItem(storageKey(tableId)));
  } catch {
    return DEFAULTS;
  }
}

function write(tableId: string, prefs: TablePreferences): void {
  try {
    window.localStorage.setItem(storageKey(tableId), JSON.stringify(prefs));
  } catch {
    // A preference that cannot be persisted is still usable for this session.
  }
}

export interface UseTablePreferences {
  density: TableDensity;
  setDensity: (density: TableDensity) => void;
  hiddenColumns: ReadonlySet<string>;
  toggleColumn: (key: string) => void;
  views: readonly SavedTableView[];
  saveView: (name: string, filters?: Record<string, string>) => void;
  applyView: (id: string) => SavedTableView | null;
  deleteView: (id: string) => void;
}

/**
 * @param tableId Stable identifier for this table. Changing it orphans a
 *   user's saved views, so treat it as part of the table's public contract.
 * @param defaultHiddenColumns Columns hidden until the user says otherwise.
 */
export function useTablePreferences(
  tableId: string,
  defaultHiddenColumns: readonly string[] = [],
): UseTablePreferences {
  const [prefs, setPrefs] = useState<TablePreferences>(() => {
    const stored = read(tableId);

    // A first visit has no stored entry; honour the table's own defaults
    // rather than showing every column.
    return stored.hiddenColumns.length === 0 && !hasStoredEntry(tableId)
      ? { ...stored, hiddenColumns: [...defaultHiddenColumns] }
      : stored;
  });

  useEffect(() => {
    write(tableId, prefs);
  }, [tableId, prefs]);

  const setDensity = useCallback((density: TableDensity) => {
    setPrefs((p) => ({ ...p, density }));
  }, []);

  const toggleColumn = useCallback((key: string) => {
    setPrefs((p) => ({
      ...p,
      hiddenColumns: p.hiddenColumns.includes(key)
        ? p.hiddenColumns.filter((k) => k !== key)
        : [...p.hiddenColumns, key],
    }));
  }, []);

  const saveView = useCallback(
    (name: string, filters?: Record<string, string>) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      setPrefs((p) => ({
        ...p,
        views: [
          // Saving over an existing name replaces it rather than creating a
          // second view the user cannot tell apart.
          ...p.views.filter((v) => v.name !== trimmed),
          {
            id: `${Date.now()}-${trimmed}`,
            name: trimmed,
            hiddenColumns: [...p.hiddenColumns],
            density: p.density,
            ...(filters ? { filters } : {}),
          },
        ],
      }));
    },
    [],
  );

  const applyView = useCallback((id: string): SavedTableView | null => {
    let applied: SavedTableView | null = null;

    setPrefs((p) => {
      const view = p.views.find((v) => v.id === id);
      if (!view) return p;

      applied = view;

      return {
        ...p,
        density: view.density,
        hiddenColumns: [...view.hiddenColumns],
      };
    });

    return applied;
  }, []);

  const deleteView = useCallback((id: string) => {
    setPrefs((p) => ({ ...p, views: p.views.filter((v) => v.id !== id) }));
  }, []);

  const hiddenColumns = useMemo(
    () => new Set(prefs.hiddenColumns),
    [prefs.hiddenColumns],
  );

  return {
    density: prefs.density,
    setDensity,
    hiddenColumns,
    toggleColumn,
    views: prefs.views,
    saveView,
    applyView,
    deleteView,
  };
}

function hasStoredEntry(tableId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(tableId)) !== null;
  } catch {
    return false;
  }
}
