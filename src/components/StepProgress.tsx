// "Step 2 of 3" with a bar per step, above the registration screens.

import { StyleSheet, Text, View } from 'react-native';
import { createStyles, useTheme } from '@/theme/theme';

interface Props {
  step: number; // 1-based
  total: number;
}

export function StepProgress({ step, total }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const label = `Step ${step} of ${total}`;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: total, now: step }}
    >
      <View style={styles.bars}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.bar, { backgroundColor: i < step ? colors.brandText : colors.line }]} />
        ))}
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const useStyles = createStyles(({ colors, type }) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    bars: { flexDirection: 'row', gap: 6 },
    bar: { flex: 1, height: 4, borderRadius: 4 },
    label: { ...type.captionStrong, color: colors.muted },
  }),
);
