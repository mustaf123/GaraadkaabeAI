// The card of label/value rows on Confirm sending and the receipt:
//
//   <SummaryCard>
//     <SummaryRow label="To" value="61X XXX 4521" />
//     <SummaryRow label="Fee" value="$0.00" money />
//     <SummaryDivider dashed />
//     <SummaryRow label="New balance" value="$121.50" money strong />
//     <SummaryRow label="Status" value={<Chip label="Completed" icon={Check} />} />
//   </SummaryCard>
//
// `money` sets the value in Sora (an amount that stands alone, CLAUDE.md §4).
// `strong` is for Total and New balance. A value can also be a component.
// Screen readers read each row as one item: "Fee, $0.00".

import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { createStyles, useTheme } from '@/theme/theme';

export function SummaryCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

interface RowProps {
  label: string;
  value: ReactNode;
  money?: boolean;
  strong?: boolean;
}

export function SummaryRow({ label, value, money = false, strong = false }: RowProps) {
  const styles = useStyles();
  const valueStyle = money ? (strong ? styles.moneyStrong : styles.money) : strong ? styles.valueStrong : styles.value;

  return (
    <View style={styles.row} accessible>
      <Text style={styles.label}>{label}</Text>
      {typeof value === 'string' ? <Text style={[styles.valueText, valueStyle]}>{value}</Text> : value}
    </View>
  );
}

// A solid line (Confirm sending) or a dashed one (the receipt). React Native can't
// dash a single border side reliably, so the dashed line is drawn.
export function SummaryDivider({ dashed = false }: { dashed?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (!dashed) return <View style={styles.line} />;
  return (
    <Svg width="100%" height={2} style={styles.dashed}>
      <Line x1={0} y1={1} x2="100%" y2={1} stroke={colors.line} strokeWidth={2} strokeDasharray="6 4" />
    </Svg>
  );
}

const useStyles = createStyles(({ colors, radius, type }) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radius.card,
      padding: 20,
      gap: 14,
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
    label: { ...type.body, color: colors.muted },
    valueText: { flexShrink: 1, textAlign: 'right', color: colors.text },
    value: type.bodyStrong,
    valueStrong: type.valueStrong,
    money: type.money,
    moneyStrong: type.moneyStrong,
    line: { height: 1, backgroundColor: colors.line },
    dashed: { alignSelf: 'stretch' },
  }),
);
