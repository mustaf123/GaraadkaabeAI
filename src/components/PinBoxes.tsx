// Four PIN boxes (64 x 68, radius 18) with the "Your PIN" label and a Show / Hide
// button. Box states: empty, active (blinking caret + ring), filled (dot, or the
// digit while shown). error: red borders, a short shake and the error text below.
// With "reduce motion" on, the caret stays still and there is no shake.
//
// Screen readers hear how many digits are entered, never the digits.

import { Eye, EyeOff } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { createStyles, useTheme } from '@/theme/theme';

interface Props {
  value: string;
  length?: number;
  label?: string;
  show?: boolean;
  onToggleShow?: () => void;
  // The next empty box shows the caret.
  focused?: boolean;
  // Red boxes and this text below; a new text shakes the boxes again.
  error?: string | null;
}

export function PinBoxes({ value, length = 4, label = 'Your PIN', show = false, onToggleShow, focused = true, error = null }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!error || reduceMotion) return;
    shake.set(
      withSequence(
        withTiming(-8, { duration: 50 }),
        withRepeat(withTiming(8, { duration: 90 }), 4, true),
        withTiming(0, { duration: 50 }),
      ),
    );
  }, [error, reduceMotion, shake]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
  const ShowIcon = show ? EyeOff : Eye;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {onToggleShow ? (
          <Pressable
            onPress={onToggleShow}
            accessibilityRole="button"
            accessibilityLabel={show ? 'Hide PIN' : 'Show PIN'}
            hitSlop={4}
            style={({ pressed }) => [styles.showButton, pressed && styles.pressed]}
          >
            <ShowIcon size={18} color={colors.brandText} strokeWidth={2} />
            <Text style={styles.showLabel}>{show ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>

      <Animated.View
        style={[styles.boxes, shakeStyle]}
        accessible
        accessibilityLabel={`${label}: ${value.length} of ${length} digits entered`}
      >
        {Array.from({ length }, (_, i) => {
          const digit = value[i];
          const active = focused && !error && i === value.length;
          const filled = digit !== undefined;
          return (
            <View
              key={i}
              testID={`pin-box-${i}`}
              style={[
                styles.box,
                filled || active ? styles.boxFilled : styles.boxEmpty,
                error ? styles.boxError : null,
              ]}
            >
              {active ? <View style={styles.ring} pointerEvents="none" /> : null}
              {active ? <Caret color={colors.brandText} still={reduceMotion} /> : null}
              {filled && show ? <Text style={styles.digit}>{digit}</Text> : null}
              {filled && !show ? <View testID={`pin-dot-${i}`} style={styles.dot} /> : null}
            </View>
          );
        })}
      </Animated.View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Caret({ color, still }: { color: string; still: boolean }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (still) return;
    // On for half a second, off for half a second.
    opacity.set(
      withRepeat(
        withSequence(withTiming(1, { duration: 500 }), withTiming(0, { duration: 0 }), withTiming(0, { duration: 500 }), withTiming(1, { duration: 0 })),
        -1,
        false,
        undefined,
        ReduceMotion.Never,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [opacity, still]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[{ width: 2, height: 26, borderRadius: 2, backgroundColor: color }, style]} />;
}

const useStyles = createStyles(({ colors, radius, type }) =>
  StyleSheet.create({
    wrap: { gap: 14, alignSelf: 'stretch' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { ...type.label, color: colors.text },
    showButton: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 10, borderRadius: 10 },
    pressed: { opacity: 0.6 },
    showLabel: { ...type.label, color: colors.brandText },
    boxes: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
    box: { width: 64, height: 68, borderRadius: radius.pin, alignItems: 'center', justifyContent: 'center' },
    boxFilled: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brandText },
    boxEmpty: { backgroundColor: colors.pinEmpty, borderWidth: 1.5, borderColor: colors.pinEmptyBorder },
    boxError: { borderWidth: 2, borderColor: colors.danger },
    ring: {
      position: 'absolute',
      top: -6,
      left: -6,
      right: -6,
      bottom: -6,
      borderRadius: radius.pin + 4,
      borderWidth: 4,
      borderColor: colors.focusRing,
    },
    digit: { ...type.digit, color: colors.text },
    dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.text },
    error: { ...type.captionStrong, color: colors.danger, textAlign: 'center' },
  }),
);
