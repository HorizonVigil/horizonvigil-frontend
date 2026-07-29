import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; message: string; tone: ToastTone }

interface ToastContextType {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  error: 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  info: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200',
};

/**
 * Mounted once at the app root. Every mutating action across the app
 * (validate, disconnect, delete, credential updates, ...) can call `toast()`
 * to surface a brief confirmation instead of silently refetching data and
 * leaving the user to notice the row changed.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++;
    setItems(prev => [...prev, { id, message, tone }]);
    setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {items.map(item => (
          <div key={item.id} role="status" className={`rounded-lg border px-3.5 py-2.5 text-sm shadow-lg animate-[fadeIn_0.15s_ease-out] ${TONE_STYLES[item.tone]}`}>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
