// A line, "or", and another line: between Login with PIN and the fingerprint
// button on Login.

import { StyleSheet, Text, View } from 'react-native';
import { createStyles } from '@/theme/theme';

export function OrDivider({ label = 'or' }: { label?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const useStyles = createStyles(({ colors, type }) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
    line: { flex: 1, height: 1, backgroundColor: colors.line },
    label: { ...type.captionStrong, color: colors.muted },
  }),
);
