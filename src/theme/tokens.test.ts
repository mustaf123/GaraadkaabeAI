// Text contrast in both themes (WCAG 2.2, SC 1.4.3): at least 4.5:1 for every text
// colour on every background it is used on. Semi-transparent backgrounds are first
// laid over the surface they sit on.
//
// Not checked, as WCAG allows: disabled buttons (onDisabled), decorative lines and
// borders. The white icons on the Home action circles are labelled by the text
// under them.

import { darkColors, lightColors, type ThemeColors } from './tokens';

type Rgba = [number, number, number, number];

function parse(color: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
  throw new Error(`unknown colour ${color}`);
}

// A colour laid over an opaque one.
function over(top: string, base: string): Rgba {
  const [r, g, b, a] = parse(top);
  const [R, G, B] = parse(base);
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Key = keyof ThemeColors;
// [text, background, what the background sits on (for semi-transparent ones)]
const TEXT_PAIRS: [Key, Key, Key?][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'sheet'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['muted', 'sheet'],
  ['brandText', 'bg'],
  ['brandText', 'surface'],
  ['brandText', 'sheet'],
  ['positive', 'bg'],
  ['positive', 'surface'],
  ['danger', 'bg'],
  ['danger', 'surface'],
  ['onBrand', 'brand'],
  ['onDanger', 'dangerFill'],
  ['onBadge', 'badge'],
  ['text', 'segmentActive'],
  ['muted', 'segmentTrack'],
  ['cardText', 'cardBg'],
  ['cardMuted', 'cardBg'],
  ['cardText', 'cardBtn', 'cardBg'],
  ['promoText', 'promoBg'],
  ['promoMuted', 'promoBg'],
  ['promoBtnText', 'promoBtn'],
  ['promoBtnText', 'promoBtnPressed'],
  ['warnText', 'warnSoft', 'sheet'],
  ['warnText', 'warnSoft', 'bg'], // warning InfoBanner on a page (Recovery code)
  ['brandText', 'brandSoft'], // info InfoBanner, Chip
  ['onBrand', 'chipOnBrand', 'brand'], // Chip on the green Login header
  ['text', 'brandSoft'], // a quick amount while pressed
];

// Icons (non-text, SC 1.4.11): at least 3:1 on their tile.
const ICON_PAIRS: [Key, Key, Key][] = [
  ['danger', 'dangerSoft', 'surface'],
  ['danger', 'dangerSoft', 'bg'],
  ['positive', 'positiveSoft', 'surface'],
  ['positive', 'positiveSoft', 'bg'],
  ['brandText', 'brandSoft', 'surface'],
  // Checkbox: the tick on the ticked box, and the box on the page
  ['onCheck', 'checkOn', 'bg'],
  ['checkOn', 'bg', 'bg'],
  ['checkOn', 'surface', 'surface'],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)('%s theme', (_name, colors) => {
  const background = (bg: Key, base?: Key) => (base ? over(colors[bg], colors[base]) : parse(colors[bg]));

  it.each(TEXT_PAIRS.map(([fg, bg, base]) => [fg, bg, base ?? bg] as const))('%s on %s has text contrast >= 4.5', (fg, bg, base) => {
    const ratio = contrast(over(colors[fg], colors[base]), background(bg, base === bg ? undefined : base));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ICON_PAIRS)('%s icon on %s (over %s) has contrast >= 3', (fg, bg, base) => {
    const tile = over(colors[bg], colors[base]);
    const ratio = contrast(over(colors[fg], colors[base]), tile);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it('defines every token as a colour', () => {
    for (const value of Object.values(colors)) expect(() => parse(value)).not.toThrow();
  });
});

describe('light and dark', () => {
  it('have the same tokens', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });
});
