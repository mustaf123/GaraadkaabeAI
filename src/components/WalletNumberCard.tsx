// "Your wallet number" on Home: the full number and a Share button that opens the
// Receive sheet. Dark green in both themes (it stands out on either page colour).

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatPhone } from '@/lib/format';
import { createStyles } from '@/theme/theme';
import { fonts } from '@/theme/typography';
import { LogoMark } from './LogoMark';

interface Props {
  // 9 digits, e.g. "615552046"
  phone: string;
  onShare?: () => void;
}

export function WalletNumberCard({ phone, onShare }: Props) {
  const styles = useStyles();
  const number = formatPhone(phone);

  return (
    <View style={styles.card}>
      <View style={styles.ring} pointerEvents="none" />
      <LogoMark size={44} variant="white" />
      <View style={styles.text} accessible accessibilityLabel={`Your wallet number ${number}`}>
        <Text style={styles.label}>Your wallet number</Text>
        <Text style={styles.number} numberOfLines={1} adjustsFontSizeToFit>
          {number}
        </Text>
      </View>
      <Pressable
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel="Share your wallet number"
        style={({ pressed }) => [styles.share, pressed && styles.sharePressed]}
      >
        <Text style={styles.shareText}>Share</Text>
      </Pressable>
    </View>
  );
}

const useStyles = createStyles(({ colors, radius, type, touch }) =>
  StyleSheet.create({
    card: {
      borderRadius: radius.walletCard,
      backgroundColor: colors.promoBg,
      paddingVertical: 16,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      overflow: 'hidden',
    },
    ring: {
      position: 'absolute',
      width: 160,
      height: 160,
      borderRadius: 80,
      backgroundColor: colors.promoRing,
      left: -50,
      bottom: -90,
    },
    text: { flex: 1, gap: 3 },
    label: { ...type.captionStrong, color: colors.promoMuted },
    number: { fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 22, letterSpacing: 0.51, color: colors.promoText },
    share: {
      height: touch,
      paddingHorizontal: 16,
      borderRadius: radius.tile,
      backgroundColor: colors.promoBtn,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sharePressed: { backgroundColor: colors.promoBtnPressed },
    shareText: { ...type.bodyStrong, fontFamily: fonts.bodyExtraBold, color: colors.promoBtnText },
  }),
);
