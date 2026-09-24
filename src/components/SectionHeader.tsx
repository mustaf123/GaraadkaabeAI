// A small uppercase grey heading over a group: "TODAY" (Notifications, History),
// "SECURITY" (Profile). 12 px on every screen. Screen readers announce it as a
// heading. Spacing above and below is left to the screen.
//
// It sits flush with the card edge on every screen (as on History), so all
// section headings line up the same way.

import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { createStyles } from '@/theme/theme';

interface Props {
  title: string;
  style?: StyleProp<TextStyle>;
}

export function SectionHeader({ title, style }: Props) {
  const styles = useStyles();
  return (
    <Text style={[styles.text, style]} accessibilityRole="header">
      {title}
    </Text>
  );
}

const useStyles = createStyles(({ colors, type }) =>
  StyleSheet.create({
    text: { ...type.overline, color: colors.muted },
  }),
);
