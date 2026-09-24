// One transfer in a list. size="home": 56 high, 42 icon (Home). size="list": 64
// high, 40 icon (History, inside a card). Sent = paper plane, received = tray.
// hideAmount shows •••• (the eye next to "Transactions" on Home).

import { Download, Send } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatSignedMoney } from '@/lib/format';
import { createStyles, useTheme } from '@/theme/theme';

interface Props {
  direction: 'sent' | 'received';
  counterparty: string; // already masked: 61X XXX 4521
  when: string; // "Today, 19:12"
  amount: string | number;
  hideAmount?: boolean;
  size?: 'home' | 'list';
  onPress?: () => void;
}

export function TransactionRow({ direction, counterparty, when, amount, hideAmount = false, size = 'home', onPress }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const sent = direction === 'sent';
  const Icon = sent ? Send : Download;
  const title = sent ? `Sent to ${counterparty}` : `Received from ${counterparty}`;
  const money = formatSignedMoney(amount, direction);
  const iconSize = size === 'home' ? 42 : 40;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${hideAmount ? 'amount hidden' : money}, ${when}`}
      style={({ pressed }) => [styles.row, { height: size === 'home' ? 56 : 64 }, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.icon,
          { width: iconSize, height: iconSize, borderRadius: iconSize / 2 },
          { backgroundColor: sent ? colors.dangerSoft : colors.positiveSoft },
        ]}
      >
        <Icon size={20} color={sent ? colors.danger : colors.positive} strokeWidth={2} />
      </View>
      <View style={styles.middle}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.when}>{when}</Text>
      </View>
      <Text style={[styles.amount, { color: sent ? colors.text : colors.positive }]}>{hideAmount ? '••••' : money}</Text>
    </Pressable>
  );
}

const useStyles = createStyles(({ colors, type }) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    // Pressed: a soft background behind the row; the icon and text never fade.
    pressed: { backgroundColor: colors.line, borderRadius: 12 },
    icon: { alignItems: 'center', justifyContent: 'center' },
    middle: { flex: 1, minWidth: 0, gap: 2 },
    title: { ...type.bodyStrong, color: colors.text },
    when: { ...type.caption, color: colors.muted },
    amount: type.money,
  }),
);
