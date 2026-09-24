// The GaraadKaabeAI mark: a rounded square with a G and the gold sparkle
// (design/screens/Logo.dc.html).
//   green: green square, white G (default; on light or near-black backgrounds)
//   white: white square, green G (on green backgrounds, e.g. the wallet-number card)
//
// Decorative: the words next to it name the app, so screen readers skip it.

import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/theme';

interface Props {
  size?: number;
  variant?: 'green' | 'white';
}

// Drawn on a 100 × 100 grid, as in the mockup.
const G = 'M64.97 37.03 A24 24 0 1 0 72 54 H50';
const SPARKLE = 'M78 13 C79.2 20.5 81.5 22.8 89 24 C81.5 25.2 79.2 27.5 78 35 C76.8 27.5 74.5 25.2 67 24 C74.5 22.8 76.8 20.5 78 13 Z';

export function LogoMark({ size = 44, variant = 'green' }: Props) {
  const { colors } = useTheme();
  const tile = variant === 'green' ? colors.logoGreen : colors.logoWhite;
  const letter = variant === 'green' ? colors.logoWhite : colors.logoGreen;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={false} importantForAccessibility="no-hide-descendants">
      <Rect width={100} height={100} rx={24} fill={tile} />
      <Path d={G} fill="none" stroke={letter} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={SPARKLE} fill={colors.accent} />
    </Svg>
  );
}
