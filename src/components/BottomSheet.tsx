// A sheet that slides up over a dark backdrop (radius 28 on top, grab handle).
// Tapping the backdrop or the Android back button calls onClose. With "reduce
// motion" on, it appears and disappears without sliding.

import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { createStyles } from '@/theme/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Read by screen readers, e.g. "Receive money".
  label: string;
  children: ReactNode;
}

const OPEN_MS = 300;
const CLOSE_MS = 220;

export function BottomSheet({ visible, onClose, label, children }: Props) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  // Stays mounted while the closing slide runs.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  const progress = useSharedValue(0);
  const height = useSharedValue(800);

  useEffect(() => {
    if (visible) {
      progress.set(withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
    } else {
      progress.set(
        withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic), reduceMotion: ReduceMotion.System }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.get()) * height.get() }] }));
  const onLayout = (e: LayoutChangeEvent) => height.set(e.nativeEvent.layout.height);

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          onLayout={onLayout}
          style={[styles.panel, { paddingBottom: 32 + insets.bottom }, panelStyle]}
          accessibilityViewIsModal
          accessibilityLabel={label}
        >
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = createStyles(({ colors, radius }) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { backgroundColor: colors.scrim },
    fill: { flex: 1 },
    panel: {
      backgroundColor: colors.sheet,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      paddingTop: 12,
      paddingHorizontal: 24,
      gap: 16,
      alignItems: 'center',
    },
    handle: { width: 44, height: 5, borderRadius: 5, backgroundColor: colors.line },
  }),
);
