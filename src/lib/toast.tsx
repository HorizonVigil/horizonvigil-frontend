import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ToastContextType {
  toast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const TOAST_DURATION_MS = 4_000;
const MAX_VISIBLE_TOASTS = 5;
const MAX_MESSAGE_LENGTH = 1_000;

const TONE_STYLES: Readonly<Record<ToastTone, string>> = {
  success:
    'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  error:
    'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  info:
    'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200',
};

function normalizeMessage(message: unknown): string {
  if (typeof message !== 'string') return '';

  const normalized = message.trim();

  if (!normalized) return '';

  return normalized.length > MAX_MESSAGE_LENGTH
    ? `${normalized.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
    : normalized;
}

/**
 * Mounted once at the app root. Mutating actions across the app can call
 * toast() to surface brief, actionable feedback without relying on a
 * background refetch for user-visible confirmation.
 *
 * The provider owns all toast timers and cleans them up on unmount.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);

    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }

    setItems(previous => previous.filter(item => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const normalizedMessage = normalizeMessage(message);

      if (!normalizedMessage) return;

      const safeTone: ToastTone =
        tone === 'success' || tone === 'error' || tone === 'info'
          ? tone
          : 'info';

      const id = nextId.current++;

      setItems(previous => {
        const next = [
          ...previous,
          { id, message: normalizedMessage, tone: safeTone },
        ];

        // Keep the newest notifications when the application generates
        // several messages in a short period.
        if (next.length <= MAX_VISIBLE_TOASTS) return next;

        const removed = next.slice(0, next.length - MAX_VISIBLE_TOASTS);

        for (const item of removed) {
          const timer = timers.current.get(item.id);

          if (timer !== undefined) {
            clearTimeout(timer);
            timers.current.delete(item.id);
          }
        }

        return next.slice(-MAX_VISIBLE_TOASTS);
      });

      const timer = setTimeout(() => {
        timers.current.delete(id);
        setItems(previous => previous.filter(item => item.id !== id));
      }, TOAST_DURATION_MS);

      timers.current.set(id, timer);
    },
    [],
  );

  useEffect(() => {
    /*
     * Captured at effect time, not read at cleanup time.
     *
     * A cleanup closure that reaches through `timers.current` reads the ref as
     * it stands on unmount, which is not guaranteed to be the object the
     * effect saw. Holding the Map itself makes the cleanup clear exactly the
     * timers this effect is responsible for.
     */
    const pending = timers.current;

    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }

      pending.clear();
    };
  }, []);

  const clearToasts = useCallback(() => {
    for (const timer of timers.current.values()) {
      clearTimeout(timer);
    }

    timers.current.clear();
    setItems([]);
  }, []);

  const value = useMemo<ToastContextType>(
    () => ({
      toast,
      dismissToast,
      clearToasts,
    }),
    [toast, dismissToast, clearToasts],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(calc(100vw-2rem),24rem)] max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map(item => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto rounded-lg border px-3.5 py-2.5 text-sm shadow-lg animate-[fadeIn_0.15s_ease-out] ${TONE_STYLES[item.tone]}`}
          >
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 break-words">{item.message}</p>

              <button
                type="button"
                onClick={() => dismissToast(item.id)}
                className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
                aria-label="Dismiss notification"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);

  if (context === null) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
}
