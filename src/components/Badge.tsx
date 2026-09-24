// Unread count on the Alerts tab and the Home bell. Nothing is shown for 0;
// more than 99 shows "99+".

import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { createStyles } from '@/theme/theme';

interface Props {
  count: number;
  // Draws a ring in the page colour, so the badge stands out over an icon button.
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ count, ring = false, style }: Props) {
  const styles = useStyles();
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, ring && styles.ring, style]} pointerEvents="none">
      <Text style={styles.text} allowFontScaling={false}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

const useStyles = createStyles(({ colors, radius, type }) =>
  StyleSheet.create({
    badge: {
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: radius.pill,
      backgroundColor: colors.badge,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ring: { borderWidth: 2, borderColor: colors.bg, paddingHorizontal: 3 },
    text: { ...type.badge, color: colors.onBadge },
  }),
);
