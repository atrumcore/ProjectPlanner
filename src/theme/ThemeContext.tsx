import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { themes, getActiveThemeName, type ThemeColors, type ThemeName } from './colors';

interface ThemeContextValue {
  theme: ThemeName;
  colors: ThemeColors;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'dha-theme';

/** Apply the theme to <html data-theme> and persist the choice. */
function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => getActiveThemeName());

  // Keep <html data-theme> + storage in sync whenever the theme changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeName) => setThemeState(t), []);
  const toggleTheme = useCallback(
    () => setThemeState(prev => (prev === 'dark' ? 'light' : 'dark')),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, colors: themes[theme], setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Hooks live alongside the provider intentionally; this rule only affects HMR
// fast-refresh granularity for this file, not correctness.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

/** Convenience hook for SVG/JS components that only need the colour palette. */
// eslint-disable-next-line react-refresh/only-export-components
export function useThemeColors(): ThemeColors {
  return useTheme().colors;
}
