// Fonts and text styles (CLAUDE.md §4). Sora for headings and money, Manrope for
// body text. Each weight is its own font family, so styles never set fontWeight
// (Android would otherwise fake bold on top of the real weight).
//
// Text styles carry no colour: components add it from useTheme().

import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { Sora_500Medium } from '@expo-google-fonts/sora/500Medium';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import type { TextStyle } from 'react-native';

// Passed to useFonts in the root layout.
export const fontAssets = {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
};

export const fonts = {
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  bodyExtraBold: 'Manrope_800ExtraBold',
  headingMedium: 'Sora_500Medium',
  heading: 'Sora_600SemiBold',
  headingBold: 'Sora_700Bold',
} as const;

export const type = {
  // Screen title: "Create a 4-digit PIN"
  title: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.56 },
  // Balance on the Home card
  balance: { fontFamily: fonts.headingBold, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  // Bottom sheet title: "Receive money"
  sheetTitle: { fontFamily: fonts.headingBold, fontSize: 22, lineHeight: 28 },
  // Section heading: "Transactions"
  section: { fontFamily: fonts.headingBold, fontSize: 19, lineHeight: 24 },
  // Small screen header: "History", "Profile"
  header: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20 },
  label: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  captionStrong: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 18 },
  // Status under a field: "Registered wallet · 61X XXX 4521"
  captionBold: { fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18 },
  // Label above a text field: "Phone number"
  fieldLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 18 },
  // Text typed into a field
  input: { fontFamily: fonts.bodySemiBold, fontSize: 17, lineHeight: 22 },
  // Group heading: "TODAY", "PREFERENCES"
  overline: { fontFamily: fonts.bodyExtraBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.96, textTransform: 'uppercase' },
  button: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 20 },
  // Amounts in rows
  money: { fontFamily: fonts.heading, fontSize: 15, lineHeight: 20 },
  // PIN box digit and keypad key
  digit: { fontFamily: fonts.headingBold, fontSize: 28, lineHeight: 34 },
  key: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30 },
  badge: { fontFamily: fonts.bodyExtraBold, fontSize: 11, lineHeight: 14 },
  tab: { fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 16 },
  tabActive: { fontFamily: fonts.bodyExtraBold, fontSize: 13, lineHeight: 16 },
} satisfies Record<string, TextStyle>;
