import { createContext, useContext, useEffect, useCallback, type ReactNode } from 'react';

type ThemeMode = 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  theme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 's1-theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Force dark theme on document permanently
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, 'dark');
    } catch {
      // ignore
    }
  }, []);

  const setMode = useCallback((_newMode: ThemeMode) => {
    // Permanently dark mode
  }, []);

  const toggleTheme = useCallback(() => {
    // Permanently dark mode
  }, []);

  return (
    <ThemeContext.Provider value={{ mode: 'dark', theme: 'dark', setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
}
