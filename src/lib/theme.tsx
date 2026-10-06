import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // UI V2: LIGHT is the default experience. This previously defaulted to
    // 'dark', which is why the dashboard opened in dark mode even though the
    // whole premium palette (warm off-white canvas, white surfaces, charcoal
    // ink) is designed light-first.
    //
    // A stored value still wins, so anyone who actively chose dark keeps it.
    // Only the DEFAULT changes -- nobody's explicit preference is overridden.
    let stored: Theme | null = null;
    try {
      stored = localStorage.getItem('theme') as Theme | null;
    } catch {
      /* private mode / blocked storage -- fall through to the default */
    }
    return stored === 'dark' || stored === 'light' ? stored : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
