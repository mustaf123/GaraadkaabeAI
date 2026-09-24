import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { fontAssets } from '@/theme/typography';

// Keep the splash screen up until the fonts are ready (no flash of system fonts).
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts(fontAssets);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <ThemeProvider>
      <RootStack />
    </ThemeProvider>
  );
}

function RootStack() {
  const { scheme, colors } = useTheme();

  // React Navigation's own colours (screen backgrounds during transitions).
  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.brandText,
        background: colors.bg,
        card: colors.bg,
        text: colors.text,
        border: colors.line,
        notification: colors.badge,
      },
    };
  }, [scheme, colors]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {/* The component gallery exists only in development builds. */}
        <Stack.Protected guard={__DEV__}>
          <Stack.Screen name="dev/gallery" />
        </Stack.Protected>
      </Stack>
    </NavigationThemeProvider>
  );
}
