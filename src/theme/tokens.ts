// Design tokens (CLAUDE.md §4). Screens and components never hard-code a colour:
// they read these through useTheme().
//
// Light comes from the mockups. Dark is based on the Home mockup's dark theme; the
// rest of the dark palette follows the same rules (brand text turns mint, cards and
// surfaces are lifted greens). src/theme/tokens.test.ts checks text contrast in both.
//
// Naming: the mockups call the green text/icon colour "accent". Here that is
// `brandText`, and `accent` stays the gold of the logo sparkle.

export type Scheme = 'light' | 'dark';

export interface ThemeColors {
  // Page
  bg: string; // every screen background, including the tab bar
  surface: string; // cards, inputs, keypad keys
  sheet: string; // bottom sheets
  text: string;
  muted: string;
  faint: string; // chevrons and other hints, never text
  line: string;

  // Brand
  brand: string; // primary button fill
  onBrand: string; // text and icons on `brand`
  brandText: string; // links, active tab, green icons and labels on the page
  brandSoft: string; // icon tiles, success chips
  focusRing: string;
  accent: string; // logo sparkle, small highlights only (never text)

  // Money direction
  positive: string; // received amounts and icons
  positiveSoft: string;
  danger: string; // sent icons, Log out, delete
  dangerSoft: string;
  dangerLine: string;
  dangerFill: string; // Delete account button
  onDanger: string;

  // Home action circles
  send: string;
  receive: string;
  history: string;
  security: string;
  onAction: string;

  // Controls
  disabledFill: string;
  onDisabled: string;
  dangerDisabledFill: string;
  onDangerDisabled: string;
  pinEmpty: string;
  pinEmptyBorder: string;
  segmentTrack: string;
  segmentActive: string;
  toggleOn: string;
  toggleOff: string;
  knob: string;
  badge: string;
  onBadge: string;
  scrim: string;
  shadow: string;

  // Balance card
  cardBg: string;
  cardText: string;
  cardMuted: string;
  cardLine: string;
  cardBtn: string;
  cardRing: string;

  // Logo mark (the same in both themes; the sparkle is `accent`)
  logoGreen: string;
  logoWhite: string;

  // Wallet-number card on Home (the same in both themes)
  promoBg: string;
  promoText: string;
  promoMuted: string;
  promoRing: string; // the soft circle, bottom left
  promoBtn: string; // the white Share button
  promoBtnPressed: string;
  promoBtnText: string;

  // Warning box (e.g. "You still have $121.50")
  warnSoft: string;
  warnText: string;
}

const fixed = {
  accent: '#F2B544',
  send: '#F07167',
  receive: '#2FBF8F',
  history: '#6C8CF5',
  security: '#F2A93B',
  onAction: '#FFFFFF',
  onBrand: '#FFFFFF',
  onDanger: '#FFFFFF',
  knob: '#FFFFFF',
  badge: '#D93036', // mockup #E5484D, darkened: white text on it needs 4.5:1
  onBadge: '#FFFFFF',
  logoGreen: '#0B6B57',
  logoWhite: '#FFFFFF',
  promoBg: '#0B3D33',
  promoText: '#FFFFFF',
  promoMuted: '#A9D8C8',
  promoRing: 'rgba(255,255,255,0.05)',
  promoBtn: '#FFFFFF',
  promoBtnPressed: '#E3F1EC',
  promoBtnText: '#0B6B57',
} as const;

export const lightColors: ThemeColors = {
  ...fixed,
  bg: '#F3F5F2',
  surface: '#FFFFFF',
  sheet: '#FFFFFF',
  text: '#10201B',
  muted: '#56665F',
  faint: '#9AA8A2',
  line: '#E1E7E3',

  brand: '#0B6B57',
  brandText: '#0B6B57',
  brandSoft: '#E3F1EC',
  focusRing: 'rgba(11,107,87,0.15)',

  positive: '#0B6B57',
  positiveSoft: '#E3F1EC',
  danger: '#B42318',
  dangerSoft: '#FCE8E6',
  dangerLine: '#F3C9C4',
  dangerFill: '#B42318',

  disabledFill: '#C9D3CE',
  onDisabled: '#FFFFFF',
  dangerDisabledFill: '#E8C4BF',
  onDangerDisabled: '#FFFFFF',
  pinEmpty: '#E9EEEB',
  pinEmptyBorder: '#D5DED9',
  segmentTrack: '#E4EAE6',
  segmentActive: '#FFFFFF',
  toggleOn: '#0B6B57',
  toggleOff: '#C9D3CE',
  scrim: 'rgba(5,10,8,0.55)',
  shadow: '#10201B',

  cardBg: '#0B6B57',
  cardText: '#FFFFFF',
  cardMuted: '#D5ECE4',
  cardLine: 'rgba(255,255,255,0.18)',
  cardBtn: 'rgba(255,255,255,0.14)',
  cardRing: 'rgba(255,255,255,0.07)',

  warnSoft: '#FDF3DC',
  warnText: '#7A5A12',
};

export const darkColors: ThemeColors = {
  ...fixed,
  bg: '#0E1512',
  surface: '#1A2420',
  sheet: '#16201C',
  text: '#F1F5F3',
  muted: '#9DB0A8',
  faint: '#5F726A',
  line: '#26332D',

  brand: '#0B6B57',
  brandText: '#4FD1A5',
  brandSoft: '#1F2B26',
  focusRing: 'rgba(79,209,165,0.25)',

  positive: '#4FD1A5',
  positiveSoft: 'rgba(47,191,143,0.16)',
  danger: '#F4938B',
  dangerSoft: 'rgba(240,113,103,0.16)',
  dangerLine: 'rgba(240,113,103,0.32)',
  dangerFill: '#B42318',

  disabledFill: '#26332D',
  onDisabled: '#7C8F87',
  dangerDisabledFill: '#3A2522',
  onDangerDisabled: '#8C6A66',
  pinEmpty: '#141C18',
  pinEmptyBorder: '#2C3A34',
  segmentTrack: '#1F2B26',
  segmentActive: '#33443D',
  toggleOn: '#2FBF8F',
  toggleOff: '#33443D',
  scrim: 'rgba(0,0,0,0.6)',
  shadow: '#000000',

  cardBg: '#DDF1E9',
  cardText: '#0E1F19',
  cardMuted: '#3F5A50',
  cardLine: 'rgba(14,31,25,0.12)',
  cardBtn: 'rgba(14,31,25,0.08)',
  cardRing: 'rgba(11,107,87,0.08)',

  warnSoft: 'rgba(242,181,68,0.14)',
  warnText: '#F2C66D',
};

export const radius = {
  card: 20,
  cardLarge: 24, // the balance card
  walletCard: 22, // the wallet-number card on Home
  button: 16,
  pin: 18,
  sheet: 28, // top corners
  iconButton: 14,
  tile: 12, // 38 px icon tiles in Profile rows
  segmentTrack: 14,
  segment: 10,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// Minimum touch target (NFR-09).
export const touch = 44;
