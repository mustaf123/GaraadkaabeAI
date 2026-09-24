// An on/off switch (52 x 32, knob 26), e.g. Fingerprint login and Notifications.
// The knob slides unless "reduce motion" is on.

import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { createStyles, useTheme } from '@/theme/theme';

interface Props {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  testID?: string;
}

const TRAVEL = 52 - 26 - 2 * 3;

export function Toggle({ value, onValueChange, label, disabled = false, testID }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const on = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    on.set(withTiming(value ? 1 : 0, { duration: 180, reduceMotion: ReduceMotion.System }));
  }, [value, on]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.get(), [0, 1], [colors.toggleOff, colors.toggleOn]),
  }));
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: on.get() * TRAVEL }] }));

  return (
    <Pressable
      testID={testID}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      hitSlop={6}
      style={disabled ? styles.disabled : null}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.knob, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const useStyles = createStyles(({ colors, radius }) =>
  StyleSheet.create({
    track: { width: 52, height: 32, borderRadius: radius.pill, padding: 3 },
    knob: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.knob,
      shadowColor: colors.shadow,
      shadowOpacity: 0.25,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    disabled: { opacity: 0.5 },
  }),
);
