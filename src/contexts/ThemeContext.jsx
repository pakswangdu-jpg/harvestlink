/* eslint-disable react-refresh/only-export-components */
import {
  createContext, useContext, useEffect, useMemo, useState,
} from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'harvestlink:theme';

function getSystemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveEffectiveTheme(theme, systemPrefersDark) {
  return theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'system';
    } catch {
      return 'system';
    }
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark());

  // Only relevant while theme === 'system' — kept unconditional (not torn down when the user
  // picks an explicit theme) since re-subscribing on every switch back to 'system' is more
  // complexity than just always listening for a change that's cheap to ignore.
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const effectiveTheme = useMemo(
    () => resolveEffectiveTheme(theme, systemPrefersDark),
    [theme, systemPrefersDark],
  );

  // The one DOM write the whole theme system depends on — every var(--x) consumer in
  // globals.css keys off this attribute via :root[data-theme="dark"] / [data-theme="dark"]
  // .app-shell. index.html's own inline script sets it once, synchronously, before this
  // mounts (see FOUC prevention); this just keeps it in sync afterwards.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }, [effectiveTheme]);

  const setTheme = (nextTheme) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // Storage full or unavailable — persistence is best-effort only.
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}
