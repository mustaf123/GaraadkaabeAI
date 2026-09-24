// Temporary start screen until step 5 adds the launch logic (onboarding or Login).
// In development the app opens straight on DEV_START; set it to '/dev/gallery' to
// open the component gallery instead.

import { Redirect } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { createStyles } from '@/theme/theme';

const DEV_START = '/(tabs)/home' as const;

export default function Index() {
  const styles = useStyles();
  if (__DEV__) return <Redirect href={DEV_START} />;
  return (
    <Screen contentStyle={styles.content}>
      <Text style={styles.title}>GaraadKaabeAI</Text>
      <Text style={styles.body}>The screens arrive in build step 5.</Text>
    </Screen>
  );
}

const useStyles = createStyles(({ colors, type }) =>
  StyleSheet.create({
    content: { alignItems: 'center', justifyContent: 'center', gap: 12 },
    title: { ...type.title, color: colors.text },
    body: { ...type.body, color: colors.muted, marginBottom: 12 },
  }),
);
