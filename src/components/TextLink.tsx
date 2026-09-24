// A green text link: "See all" (Home), "Forgot PIN?" (Login), "Mark all read" (Alerts).
// The text is small, so hitSlop brings the touch area to 44 high.

import { Pressable, StyleSheet, Text } from 'react-native';
import { createStyles } from '@/theme/theme';
import { fonts } from '@/theme/typography';

interface Props {
  title: string;
  onPress?: () => void;
  size?: 'regular' | 'small'; // 15 (See all) or 14 (Forgot PIN?)
  testID?: string;
}

export function TextLink({ title, onPress, size = 'regular', testID }: Props) {
  const styles = useStyles();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={title}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
    >
      {({ pressed }) => <Text style={[size === 'regular' ? styles.regular : styles.small, pressed && styles.pressed]}>{title}</Text>}
    </Pressable>
  );
}

const useStyles = createStyles(({ colors, type }) =>
  StyleSheet.create({
    regular: { ...type.bodyStrong, fontFamily: fonts.bodyExtraBold, color: colors.brandText },
    small: { ...type.label, color: colors.brandText },
    pressed: { textDecorationLine: 'underline' },
  }),
);
