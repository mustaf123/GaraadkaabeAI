// Pick one of a few options: History's All / Sent / Received ("regular", 40 high)
// and Profile's Appearance System / Light / Dark ("compact", 32 high).

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createStyles, useTheme } from '@/theme/theme';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string; // what is being chosen, for screen readers
  size?: 'regular' | 'compact';
}

export function SegmentedControl<T extends string>({ options, value, onChange, label, size = 'regular' }: Props<T>) {
  const { colors } = useTheme();
  const styles = useStyles();
  const compact = size === 'compact';

  return (
    <View
      style={[styles.track, compact ? styles.trackCompact : styles.trackRegular]}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            hitSlop={compact ? { top: 6, bottom: 6 } : undefined}
            style={[
              styles.segment,
              compact ? styles.segmentCompact : styles.segmentRegular,
              selected && styles.selected,
            ]}
          >
            <Text
              style={[compact ? styles.labelCompact : styles.label, { color: selected ? colors.text : colors.muted }]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = createStyles(({ colors, radius, type, scheme }) =>
  StyleSheet.create({
    track: { flexDirection: 'row', backgroundColor: colors.segmentTrack },
    trackRegular: { padding: 4, gap: 4, borderRadius: radius.segmentTrack },
    trackCompact: { padding: 3, gap: 2, borderRadius: 12 },
    segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    segmentRegular: { height: 40, borderRadius: radius.segment },
    segmentCompact: { height: 32, borderRadius: 9, paddingHorizontal: 10 },
    selected: {
      backgroundColor: colors.segmentActive,
      shadowColor: colors.shadow,
      shadowOpacity: scheme === 'dark' ? 0 : 0.12,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: scheme === 'dark' ? 0 : 1,
    },
    label: type.label,
    labelCompact: { ...type.label, fontSize: 13 },
  }),
);
