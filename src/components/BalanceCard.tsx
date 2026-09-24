// The Home balance card (radius 24): balance, show / hide eye, today's incoming money.

import { Eye, EyeOff } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '@/lib/format';
import { createStyles, useTheme } from '@/theme/theme';
import { fonts } from '@/theme/typography';

interface Props {
  balance: string | number;
  hidden?: boolean;
  onToggleHidden?: () => void;
  // Money received today, e.g. "15.00". Not shown when null.
  todayIn?: string | number | null;
}

export function BalanceCard({ balance, hidden = false, onToggleHidden, todayIn = null }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const amount = formatMoney(balance);
  const EyeIcon = hidden ? EyeOff : Eye;

  return (
    <View style={styles.card}>
      <View style={styles.ring} pointerEvents="none" />
      <View style={styles.top}>
        <Text style={styles.caption}>Available balance</Text>
        <Pressable
          onPress={onToggleHidden}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}
          style={({ pressed }) => [styles.eye, pressed && styles.pressed]}
        >
          <EyeIcon size={22} color={colors.cardText} strokeWidth={2} />
        </Pressable>
      </View>
      <Text
        style={styles.balance}
        accessibilityLabel={hidden ? 'Balance hidden' : `Available balance ${amount}`}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {hidden ? '$ ••••••' : amount}
      </Text>
      <View style={styles.line} />
      <View style={styles.bottom}>
        <Text style={styles.wallet}>GaraadKaabeAI Wallet · USD</Text>
        {todayIn !== null ? (
          <Text style={styles.today}>{hidden ? 'Today ••••' : `Today +${formatMoney(todayIn)}`}</Text>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createStyles(({ colors, radius, type, touch }) =>
  StyleSheet.create({
    card: {
      borderRadius: radius.cardLarge,
      backgroundColor: colors.cardBg,
      paddingVertical: 20,
      paddingHorizontal: 22,
      gap: 14,
      overflow: 'hidden',
    },
    ring: {
      position: 'absolute',
      width: 200,
      height: 200,
      borderRadius: 100,
      borderWidth: 34,
      borderColor: colors.cardRing,
      right: -80,
      top: -100,
    },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    caption: { ...type.bodyStrong, fontSize: 16, color: colors.cardMuted },
    eye: {
      width: touch,
      height: touch,
      borderRadius: touch / 2,
      backgroundColor: colors.cardBtn,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { backgroundColor: colors.cardLine },
    balance: { ...type.balance, color: colors.cardText },
    line: { height: 1, backgroundColor: colors.cardLine },
    bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    wallet: { ...type.captionStrong, fontSize: 14, color: colors.cardMuted, flexShrink: 1 },
    today: { ...type.label, fontFamily: fonts.bodyExtraBold, color: colors.cardText },
  }),
);
