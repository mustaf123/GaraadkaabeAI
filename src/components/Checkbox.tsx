// A checkbox with its label, e.g. "I have written down my recovery code". The
// whole row can be tapped (at least 44 high). Drawn here, not by the platform, so
// it looks the same on Android and iOS and in both themes.

import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createStyles, useTheme } from '@/theme/theme';

interface Props {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  testID?: string;
}

export function Checkbox({ value, onValueChange, label, disabled = false, testID }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <Pressable
      testID={testID}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      style={[styles.row, disabled && styles.disabled]}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.box, value ? styles.boxOn : pressed ? styles.boxPressed : null]}>
            {value ? <Check size={16} color={colors.onCheck} strokeWidth={3} /> : null}
          </View>
          <Text style={styles.label}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const useStyles = createStyles(({ colors, radius, type, touch }) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touch, alignSelf: 'stretch' },
    box: {
      width: 22,
      height: 22,
      borderRadius: radius.check,
      borderWidth: 2,
      borderColor: colors.muted,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxOn: { borderColor: colors.checkOn, backgroundColor: colors.checkOn },
    boxPressed: { backgroundColor: colors.brandSoft },
    label: { ...type.body, fontFamily: type.fieldLabel.fontFamily, color: colors.text, flex: 1 },
    disabled: { opacity: 0.5 },
  }),
);
