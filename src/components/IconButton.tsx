// A button with only an icon (its label is read by screen readers).
//   square: the Back button (44 x 44, radius 14, white with a border)
//   round:  the Home header bell and settings (44 circle, green icon), optional badge
//   plain:  a small muted icon with no background, e.g. the eye next to
//           "Transactions" (36 drawn, 44 touch area)

import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';
import { createStyles, useTheme } from '@/theme/theme';
import { Badge } from './Badge';

interface Props {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  shape?: 'square' | 'round' | 'plain';
  badge?: number;
  testID?: string;
}

export function IconButton({ icon: Icon, label, onPress, shape = 'square', badge = 0, testID }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const a11yLabel = badge > 0 ? `${label}, ${badge} unread` : label;
  const color = shape === 'square' ? colors.text : shape === 'round' ? colors.brandText : colors.muted;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      hitSlop={shape === 'plain' ? 4 : undefined}
      style={styles[shape]}
    >
      {({ pressed }) => (
        <>
          <Icon size={shape === 'plain' ? 20 : 22} color={pressed ? colors.faint : color} strokeWidth={2} />
          <Badge count={badge} ring style={styles.badge} />
        </>
      )}
    </Pressable>
  );
}

const useStyles = createStyles(({ colors, radius, touch }) =>
  StyleSheet.create({
    square: {
      width: touch,
      height: touch,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.iconButton,
      borderWidth: 1,
      borderColor: colors.line,
    },
    round: {
      width: touch,
      height: touch,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: touch / 2,
    },
    plain: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
    badge: { position: 'absolute', top: 4, right: 4 },
  }),
);
