// The frame of every screen: page background, and content that starts below the
// status bar (and above the phone's navigation bar) using the safe-area insets.
// The status-bar strip keeps the page colour, so scrolled content never slides
// under the clock and battery icons.
//
//   <Screen>...</Screen>                 fixed content
//   <Screen scroll>...</Screen>          scrollable content
//   <Screen edges={['top']}>             tab screens: the tab bar handles the bottom

import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { createStyles } from '@/theme/theme';

interface Props {
  children: ReactNode;
  scroll?: boolean;
  edges?: readonly Edge[];
  // Padding and gaps of the content (inside the scroll view when scroll is on).
  contentStyle?: StyleProp<ViewStyle>;
  // Drawn outside the content, e.g. bottom sheets.
  overlay?: ReactNode;
}

export function Screen({ children, scroll = false, edges = ['top', 'bottom'], contentStyle, overlay }: Props) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        // "handled": a tap on a button (e.g. a quick amount) works while the keyboard is open.
        <ScrollView style={styles.fill} contentContainerStyle={[styles.content, contentStyle]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.content, contentStyle]}>{children}</View>
      )}
      {overlay}
    </SafeAreaView>
  );
}

const useStyles = createStyles(({ colors }) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    fill: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  }),
);
