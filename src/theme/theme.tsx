// The app theme: light or dark tokens, chosen by the Appearance setting.
// System (the default) follows the phone and switches live when the phone does.
//
//   const { colors } = useTheme();
//   const styles = useStyles();   // from createStyles((t) => StyleSheet.create({...}))

import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAppearance } from '@/stores/appearance';
import { darkColors, lightColors, radius, space, touch, type Scheme, type ThemeColors } from './tokens';
import { type as typeStyles } from './typography';
import { useSystemColorScheme } from './useSystemColorScheme';

export interface Theme {
  scheme: Scheme;
  colors: ThemeColors;
  radius: typeof radius;
  space: typeof space;
  type: typeof typeStyles;
  touch: number;
}

export const lightTheme: Theme = { scheme: 'light', colors: lightColors, radius, space, type: typeStyles, touch };
export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, radius, space, type: typeStyles, touch };

const ThemeContext = createContext<Theme | null>(null);

// The theme the app shows right now.
export function useResolvedScheme(): Scheme {
  const preference = useAppearance((s) => s.preference);
  const system = useSystemColorScheme();
  return preference === 'system' ? system : preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useResolvedScheme() === 'dark' ? darkTheme : lightTheme;

  // The root view behind every screen (seen during transitions and the keyboard).
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.bg).catch(() => {});
  }, [theme]);

  return (
    <ThemeContext.Provider value={theme}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

// Styles that depend on the theme, built once per theme (not on every render).
export function createStyles<T>(factory: (theme: Theme) => T): () => T {
  const cache = new Map<Theme, T>();
  return function useStyles() {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = factory(theme);
      cache.set(theme, styles);
    }
    return styles;
  };
}
