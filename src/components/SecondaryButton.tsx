// A second choice under the primary button.
//   outline: white card with a border, green label ("Use your fingerprint")
//   plain:   text only, muted, 48 high ("Close", "Cancel")

import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createStyles, useTheme } from '@/theme/theme';

interface Props {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  icon?: LucideIcon;
  variant?: 'outline' | 'plain';
  testID?: string;
}

export function SecondaryButton({ title, onPress, disabled = false, icon: Icon, variant = 'outline', testID }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const color = variant === 'outline' ? colors.brandText : colors.muted;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        variant === 'outline' ? styles.outline : styles.plain,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.content}>
        {Icon ? <Icon size={20} color={color} strokeWidth={2} /> : null}
        <Text style={[variant === 'outline' ? styles.title : styles.plainTitle, { color }]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = createStyles(({ colors, radius, type }) =>
  StyleSheet.create({
    button: { borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
    outline: { height: 56, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 20 },
    plain: { height: 48, paddingHorizontal: 16 },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.7 },
    content: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: type.button,
    plainTitle: { ...type.bodyStrong },
  }),
);
