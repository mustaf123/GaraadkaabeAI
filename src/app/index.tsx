// Temporary start screen until step 5 adds the launch logic (onboarding or Login).
// In development it links to the component gallery.

import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { createStyles } from '@/theme/theme';

export default function Index() {
  const styles = useStyles();
  return (
    <Screen contentStyle={styles.content}>
      <Text style={styles.title}>GaraadKaabeAI</Text>
      <Text style={styles.body}>The screens arrive in build step 5.</Text>
      {__DEV__ ? (
        <PrimaryButton title="Component gallery" onPress={() => router.push('/dev/gallery')} />
      ) : null}
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
