// A small pill label with an optional icon. Four sizes, from the mockups:
//   sm: "Active wallet" on Profile (24 high)
//   md: "✓ Completed" on the receipt (28)
//   lg: "Available: $131.50" on Send money (32)
//   xl: the phone number on the green Login header (34)
// Tone `brand` is soft green; `onBrand` is see-through white, for green backgrounds.
//
// The heights are minimums, so large system text grows the chip instead of cutting
// it off. It hugs its text (alignSelf flex-start) unless `style` says otherwise.

import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { createStyles, useTheme } from '@/theme/theme';

type Size = 'sm' | 'md' | 'lg' | 'xl';

interface Props {
  label: string;
  icon?: LucideIcon;
  size?: Size;
  tone?: 'brand' | 'onBrand';
  style?: StyleProp<ViewStyle>;
}

const ICON: Record<Size, { size: number; stroke: number }> = {
  sm: { size: 12, stroke: 2.2 },
  md: { size: 14, stroke: 2.2 },
  lg: { size: 16, stroke: 2 },
  xl: { size: 16, stroke: 2 },
};

export function Chip({ label, icon: Icon, size = 'md', tone = 'brand', style }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const color = tone === 'onBrand' ? colors.onBrand : colors.brandText;
  const textStyle = size === 'sm' ? styles.textSm : size === 'md' ? styles.textMd : styles.textLg;

  return (
    <View style={[styles.chip, styles[size], tone === 'onBrand' ? styles.onBrand : styles.brand, style]}>
      {Icon ? <Icon size={ICON[size].size} color={color} strokeWidth={ICON[size].stroke} /> : null}
      <Text style={[textStyle, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = createStyles(({ colors, radius, type }) =>
  StyleSheet.create({
    chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: radius.pill },
    sm: { minHeight: 24, paddingHorizontal: 10, gap: 6 },
    md: { minHeight: 28, paddingHorizontal: 12, gap: 6 },
    lg: { minHeight: 32, paddingHorizontal: 14, gap: 8 },
    xl: { minHeight: 34, paddingHorizontal: 14, gap: 8 },
    brand: { backgroundColor: colors.brandSoft },
    onBrand: { backgroundColor: colors.chipOnBrand },
    textSm: type.chipSmall,
    textMd: type.chip,
    textLg: type.label,
  }),
);
