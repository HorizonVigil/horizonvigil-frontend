import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const THEME_KEY = 'horizonvigil_theme';

export type Theme = 'light' | 'dark';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/**
 * Reads the persisted theme without allowing storage failures to break
 * application startup. Dark is the product default.
 */
function getInitialTheme(): Theme {
  if (!isBrowser()) {
    return 'dark';
  }

  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isTheme(stored) ? stored : 'dark';
  } catch {
    // Storage can be unavailable in privacy-restricted or sandboxed contexts.
    return 'dark';
  }
}

function persistTheme(theme: Theme): void {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme remains active for the current document even when persistence
    // is unavailable.
  }
}

function applyTheme(theme: Theme): void {
  if (!isBrowser()) return;

  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  /**
   * Apply the theme before the browser paints when possible. useEffect is
   * retained for SSR compatibility; useLayoutEffect is intentionally avoided
   * because it produces SSR warnings in server-rendered environments.
   */
  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  /**
   * Keep multiple HorizonVigil tabs/windows synchronized. Ignore malformed
   * or unrelated storage events.
   */
  useEffect(() => {
    if (!isBrowser()) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_KEY) return;

      if (isTheme(event.newValue)) {
        setThemeState(event.newValue);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(current => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo<ThemeContextType>(
    () => ({
      theme,
      toggleTheme,
      setTheme,
    }),
    [theme, toggleTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);

  if (context === null) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}
