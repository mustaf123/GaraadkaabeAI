// A short message with an icon, in three tones:
//   info:    soft green box, "You will get a new recovery code..." (Forgot PIN)
//   warning: gold box with a shield, "Write it on paper..." (Recovery code) and
//            "You still have $121.50..." (Delete sheet)
//   note:    no box, grey, "Check the number carefully..." (Confirm sending)
//
// Bold words go in <Strong>:
//   <InfoBanner tone="warning">You still have <Strong>$121.50</Strong>. ...</InfoBanner>
// An amount in the sentence stays in Manrope (CLAUDE.md §4).

import { Info, ShieldAlert } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { createStyles, useTheme } from '@/theme/theme';

type Tone = 'info' | 'warning' | 'note';

interface Props {
  tone?: Tone;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function InfoBanner({ tone = 'info', children, style }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const color = tone === 'info' ? colors.brandText : tone === 'warning' ? colors.warnText : colors.muted;
  const Icon = tone === 'warning' ? ShieldAlert : Info;

  return (
    <View style={[styles.row, tone !== 'note' && styles.box, tone === 'info' && styles.info, tone === 'warning' && styles.warning, style]}>
      {/* As high as one line of text, so the icon sits centred on the first line. */}
      <View style={styles.iconLine}>
        <Icon size={tone === 'warning' ? 20 : 18} color={color} strokeWidth={2} />
      </View>
      <Text style={[tone === 'note' ? styles.note : styles.text, { color }]}>{children}</Text>
    </View>
  );
}

// Bold words inside an InfoBanner (or any text): they keep the colour and size around them.
export function Strong({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.strong}>{children}</Text>;
}

const useStyles = createStyles(({ colors, radius, type }) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, alignSelf: 'stretch' },
    box: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.button },
    info: { backgroundColor: colors.brandSoft },
    warning: { backgroundColor: colors.warnSoft },
    iconLine: { height: type.banner.lineHeight, justifyContent: 'center' },
    text: { ...type.banner, flex: 1 },
    note: { ...type.note, flex: 1 },
    strong: { fontFamily: type.bodyStrong.fontFamily },
  }),
);
