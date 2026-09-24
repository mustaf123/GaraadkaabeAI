// The main action on a screen: 56 high, radius 16, full width.
// tone="danger" is the Delete account button. While loading it shows a spinner and
// can't be pressed again (no double send).

import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { createStyles, useTheme } from '@/theme/theme';

interface Props {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  tone?: 'brand' | 'danger';
  testID?: string;
}

export function PrimaryButton({ title, onPress, disabled = false, loading = false, icon: Icon, tone = 'brand', testID }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const inactive = disabled || loading;
  const fill = tone === 'danger' ? colors.dangerFill : colors.brand;
  const fg = tone === 'danger' ? colors.onDanger : colors.onBrand;
  const offFill = tone === 'danger' ? colors.dangerDisabledFill : colors.disabledFill;
  const offFg = tone === 'danger' ? colors.onDangerDisabled : colors.onDisabled;
  const color = disabled ? offFg : fg;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: disabled ? offFill : fill },
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {Icon ? <Icon size={20} color={color} strokeWidth={2} /> : null}
          <Text style={[styles.title, { color }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = createStyles(({ radius, type }) =>
  StyleSheet.create({
    button: {
      height: 56,
      borderRadius: radius.button,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      alignSelf: 'stretch',
    },
    pressed: { opacity: 0.85 },
    content: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: type.button,
  }),
);
