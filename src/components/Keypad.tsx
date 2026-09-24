// The number pad under the PIN boxes: 1-9, then 0 and Delete on the last row.
// size="regular" keys are 60 high (Create / Confirm PIN), "compact" 50 (Login,
// which also shows the fingerprint button).

import { Delete } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createStyles, useTheme } from '@/theme/theme';

interface Props {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  size?: 'regular' | 'compact';
  disabled?: boolean;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'delete'],
] as const;

export function Keypad({ onDigit, onDelete, size = 'regular', disabled = false }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const height = size === 'regular' ? 60 : 50;

  return (
    <View style={styles.pad}>
      {ROWS.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((key, c) => {
            if (key === '') return <View key={c} style={[styles.cell, { height }]} />;
            if (key === 'delete') {
              return (
                <Pressable
                  key={c}
                  testID="keypad-delete"
                  onPress={onDelete}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel="Delete last digit"
                  style={({ pressed }) => [styles.cell, styles.deleteKey, { height }, pressed && styles.pressed]}
                >
                  <Delete size={24} color={colors.text} strokeWidth={2} />
                </Pressable>
              );
            }
            return (
              <Pressable
                key={c}
                testID={`keypad-${key}`}
                onPress={() => onDigit(key)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={key}
                style={({ pressed }) => [styles.cell, styles.key, { height }, pressed && styles.pressed]}
              >
                <Text style={styles.label}>{key}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const useStyles = createStyles(({ colors, radius, type }) =>
  StyleSheet.create({
    pad: { gap: 8, alignSelf: 'stretch' },
    row: { flexDirection: 'row', gap: 8 },
    cell: { flex: 1, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
    key: { backgroundColor: colors.surface },
    deleteKey: { backgroundColor: 'transparent' },
    pressed: { backgroundColor: colors.line },
    label: { ...type.key, color: colors.text },
  }),
);
