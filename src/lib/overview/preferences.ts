/**
 * Level-2 personalization (issue §15).
 *
 * Per-user Overview preferences:
 * - widget layout
 * - hidden / added widgets
 * - favorites
 * - KPI ordering
 * - default project / environment / date range
 * - dismissed context signals
 *
 * Persistence is local to the device/browser and keyed by user id. Storage is
 * treated as optional: private browsing, disabled storage, quota errors, or
 * corrupt JSON must never make the Overview crash.
 *
 * NOTE:
 * This is a client-side personalization store, not authorization state.
 * Server-side permissions remain authoritative.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type OverviewPreferences,
  type WidgetLayoutRect,
} from './types';
import type { DateRangePreset } from '../filterContext';

const KEY_PREFIX = 'horizonvigil.overview.v1.';
const WRITE_DEBOUNCE_MS = 350;

/**
 * Keep storage keys deterministic and avoid accidental whitespace-based
 * identity collisions. We intentionally do not encode the id because it is
 * only used as a localStorage key segment and encodeURIComponent produces a
 * stable, reversible value.
 */
function storageKey(userId: string): string {
  const normalizedUserId = userId.trim();
  const identity = normalizedUserId || 'anon';
  return `${KEY_PREFIX}${encodeURIComponent(identity)}`;
}

function cloneDefaultPreferences(): OverviewPreferences {
  return {
    layout: {},
    hidden: [],
    favorites: [],
    added: [],
    kpiOrder: [],
    kpiHidden: [],
    defaults: {},
    dismissedSignals: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;

    const id = item.trim();
    if (!id || seen.has(id)) continue;

    seen.add(id);
    result.push(id);
  }

  return result;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validate saved layout records before they enter the live engine.
 *
 * Stored coordinates/dimensions are kept as numbers, but obviously invalid
 * rectangles are discarded rather than passed downstream.
 */
function normalizeLayout(value: unknown): Record<string, WidgetLayoutRect> {
  if (!isRecord(value)) return {};

  const layout: Record<string, WidgetLayoutRect> = {};

  for (const [id, rawRect] of Object.entries(value)) {
    if (!id || !isRecord(rawRect)) continue;

    const { x, y, w, h } = rawRect;

    if (
      !finiteNumber(x) ||
      !finiteNumber(y) ||
      !finiteNumber(w) ||
      !finiteNumber(h) ||
      x < 0 ||
      y < 0 ||
      w <= 0 ||
      h <= 0
    ) {
      continue;
    }

    layout[id] = {
      x,
      y,
      w,
      h,
    };
  }

  return layout;
}

function normalizeDefaults(value: unknown): OverviewPreferences['defaults'] {
  if (!isRecord(value)) return {};

  const defaults: OverviewPreferences['defaults'] = {};

  if (typeof value.projectId === 'string') {
    const projectId = value.projectId.trim();
    if (projectId) defaults.projectId = projectId;
  }

  if (typeof value.environment === 'string') {
    const environment = value.environment.trim();
    if (environment) defaults.environment = environment;
  }

  if (typeof value.dateRange === 'string') {
    defaults.dateRange = value.dateRange as DateRangePreset;
  }

  return defaults;
}

function normalizeDismissedSignals(
  value: unknown,
): Record<string, number> {
  if (!isRecord(value)) return {};

  const dismissed: Record<string, number> = {};

  for (const [key, timestamp] of Object.entries(value)) {
    if (
      key &&
      finiteNumber(timestamp) &&
      timestamp >= 0
    ) {
      dismissed[key] = timestamp;
    }
  }

  return dismissed;
}

/**
 * Coerce an unknown persisted value into a complete, safe preferences object.
 *
 * Unknown properties are discarded. Malformed nested values are discarded
 * without invalidating otherwise valid preferences.
 */
export function normalizePreferences(raw: unknown): OverviewPreferences {
  if (!isRecord(raw)) {
    return cloneDefaultPreferences();
  }

  return {
    layout: normalizeLayout(raw.layout),
    hidden: stringArray(raw.hidden),
    favorites: stringArray(raw.favorites),
    added: stringArray(raw.added),
    kpiOrder: stringArray(raw.kpiOrder),
    kpiHidden: stringArray(raw.kpiHidden),
    defaults: normalizeDefaults(raw.defaults),
    dismissedSignals: normalizeDismissedSignals(raw.dismissedSignals),
  };
}

function load(userId: string): OverviewPreferences {
  try {
    if (typeof window === 'undefined') {
      return cloneDefaultPreferences();
    }

    const raw = window.localStorage.getItem(storageKey(userId));

    if (raw === null) {
      return cloneDefaultPreferences();
    }

    return normalizePreferences(JSON.parse(raw));
  } catch {
    return cloneDefaultPreferences();
  }
}

function persist(userId: string, preferences: OverviewPreferences): void {
  try {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify(preferences),
    );
  } catch {
    // Local persistence is best-effort. In-memory state remains usable.
  }
}

function toggleValue(values: readonly string[], id: string): string[] {
  const normalizedId = id.trim();
  if (!normalizedId) return [...values];

  return values.includes(normalizedId)
    ? values.filter((value) => value !== normalizedId)
    : [...values, normalizedId];
}

export interface UseOverviewPreferences {
  prefs: OverviewPreferences;
  setLayout: (layout: Record<string, WidgetLayoutRect>) => void;
  toggleHidden: (id: string, kind: 'kpi' | 'panel') => void;
  toggleFavorite: (id: string) => void;
  addWidget: (id: string) => void;
  removeWidget: (id: string, kind: 'kpi' | 'panel') => void;
  setKpiOrder: (order: string[]) => void;
  setDefaults: (
    defaults: Partial<OverviewPreferences['defaults']>,
  ) => void;
  dismissSignal: (key: string) => void;
  reset: () => void;
}

/**
 * Per-user Overview preferences hook.
 *
 * A user-id switch is treated as a hard identity boundary:
 * the old user's preferences are reloaded before writes for the new user are
 * allowed. This prevents a render/effect race from copying user A's state into
 * user B's localStorage key.
 */
export function useOverviewPreferences(
  userId: string,
): UseOverviewPreferences {
  const normalizedUserId = userId.trim() || 'anon';

  const [prefs, setPrefs] = useState<OverviewPreferences>(() =>
    load(normalizedUserId),
  );

  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Skip the persistence effect for the commit that switches identity. The
   * reload effect runs first, but React state updates are asynchronous; without
   * this guard the old state could be persisted under the new user's key.
   */
  const skipNextPersistRef = useRef(false);
  const persistedUserIdRef = useRef(normalizedUserId);

  useEffect(() => {
    if (writeTimer.current !== null) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }

    skipNextPersistRef.current = true;
    persistedUserIdRef.current = normalizedUserId;
    setPrefs(load(normalizedUserId));
  }, [normalizedUserId]);

  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    if (persistedUserIdRef.current !== normalizedUserId) {
      return;
    }

    if (writeTimer.current !== null) {
      clearTimeout(writeTimer.current);
    }

    writeTimer.current = setTimeout(() => {
      writeTimer.current = null;

      // Do not persist if identity changed while this debounce was pending.
      if (persistedUserIdRef.current !== normalizedUserId) {
        return;
      }

      persist(normalizedUserId, prefs);
    }, WRITE_DEBOUNCE_MS);

    return () => {
      if (writeTimer.current !== null) {
        clearTimeout(writeTimer.current);
        writeTimer.current = null;
      }
    };
  }, [normalizedUserId, prefs]);

  useEffect(() => {
    return () => {
      if (writeTimer.current !== null) {
        clearTimeout(writeTimer.current);
        writeTimer.current = null;
      }
    };
  }, []);

  const update = useCallback(
    (fn: (current: OverviewPreferences) => OverviewPreferences) => {
      setPrefs((current) => fn(current));
    },
    [],
  );

  const setLayout = useCallback(
    (layout: Record<string, WidgetLayoutRect>) => {
      const normalizedLayout = normalizeLayout(layout);
      update((current) => ({
        ...current,
        layout: normalizedLayout,
      }));
    },
    [update],
  );

  const toggleHidden = useCallback(
    (id: string, kind: 'kpi' | 'panel') => {
      update((current) => {
        if (kind === 'kpi') {
          return {
            ...current,
            kpiHidden: toggleValue(current.kpiHidden, id),
          };
        }

        return {
          ...current,
          hidden: toggleValue(current.hidden, id),
          added: current.added.filter((value) => value !== id.trim()),
        };
      });
    },
    [update],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      update((current) => ({
        ...current,
        favorites: toggleValue(current.favorites, id),
      }));
    },
    [update],
  );

  const addWidget = useCallback(
    (id: string) => {
      const normalizedId = id.trim();
      if (!normalizedId) return;

      update((current) => ({
        ...current,
        added: current.added.includes(normalizedId)
          ? current.added
          : [...current.added, normalizedId],
        hidden: current.hidden.filter((value) => value !== normalizedId),
        kpiHidden: current.kpiHidden.filter(
          (value) => value !== normalizedId,
        ),
      }));
    },
    [update],
  );

  const removeWidget = useCallback(
    (id: string, kind: 'kpi' | 'panel') => {
      const normalizedId = id.trim();
      if (!normalizedId) return;

      update((current) => {
        if (kind === 'kpi') {
          return {
            ...current,
            kpiHidden: current.kpiHidden.includes(normalizedId)
              ? current.kpiHidden
              : [...current.kpiHidden, normalizedId],
            added: current.added.filter(
              (value) => value !== normalizedId,
            ),
          };
        }

        return {
          ...current,
          hidden: current.hidden.includes(normalizedId)
            ? current.hidden
            : [...current.hidden, normalizedId],
          added: current.added.filter(
            (value) => value !== normalizedId,
          ),
        };
      });
    },
    [update],
  );

  const setKpiOrder = useCallback(
    (order: string[]) => {
      update((current) => ({
        ...current,
        kpiOrder: stringArray(order),
      }));
    },
    [update],
  );

  const setDefaults = useCallback(
    (defaults: Partial<OverviewPreferences['defaults']>) => {
      update((current) => ({
        ...current,
        defaults: normalizeDefaults({
          ...current.defaults,
          ...defaults,
        }),
      }));
    },
    [update],
  );

  const dismissSignal = useCallback(
    (key: string) => {
      const normalizedKey = key.trim();
      if (!normalizedKey) return;

      update((current) => ({
        ...current,
        dismissedSignals: {
          ...current.dismissedSignals,
          [normalizedKey]: Date.now(),
        },
      }));
    },
    [update],
  );

  const reset = useCallback(() => {
    update(() => cloneDefaultPreferences());
  }, [update]);

  return {
    prefs,
    setLayout,
    toggleHidden,
    toggleFavorite,
    addWidget,
    removeWidget,
    setKpiOrder,
    setDefaults,
    dismissSignal,
    reset,
  };
}
