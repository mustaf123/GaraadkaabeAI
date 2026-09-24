// The amount on Send money: a white card with "$" and a large Sora amount, and a
// row of quick amounts ($5 $10 $20 $50). The picked one has a green border and a
// soft green fill.
//
// The value is text ("10.50"). Typing follows the server's rule (at most 10 digits
// before the dot and 2 after); an edit that breaks it is ignored. Quick amounts
// are whole cents and are compared in cents, never as decimal numbers.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatCents } from '@/lib/format';
import { amountCents, nextAmountText } from '@/lib/input';
import { createStyles, useTheme } from '@/theme/theme';
import { useFieldInputColors } from './TextField';

interface Props {
  value: string;
  onValueChange: (text: string) => void;
  label?: string;
  // In cents.
  quickAmounts?: readonly number[];
  error?: string | null;
  testID?: string;
}

const QUICK_AMOUNTS = [500, 1000, 2000, 5000] as const;

// Long amounts get smaller so they still fit the card.
function amountSize(length: number) {
  if (length <= 7) return { fontSize: 40, lineHeight: 48 };
  if (length <= 10) return { fontSize: 32, lineHeight: 48 };
  return { fontSize: 26, lineHeight: 48 };
}

export function AmountInput({ value, onValueChange, label = 'Amount (USD)', quickAmounts = QUICK_AMOUNTS, error, testID }: Props) {
  const styles = useStyles();
  const inputColors = useFieldInputColors();
  const [focused, setFocused] = useState(false);
  const cents = amountCents(value);
  const size = amountSize(Math.max(value.length, 4));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label} aria-hidden>
        {label}
      </Text>
      <View style={[styles.card, focused && styles.cardFocused, error ? styles.cardError : null]}>
        <Text style={[styles.dollar, size]} aria-hidden>
          $
        </Text>
        <TextInput
          testID={testID}
          accessibilityLabel={`${label}, in dollars`}
          {...inputColors}
          value={value}
          onChangeText={(text) => onValueChange(nextAmountText(value, text))}
          placeholder="0.00"
          keyboardType="decimal-pad"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, size]}
        />
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={styles.quickRow}>
        {quickAmounts.map((amount) => (
          <QuickAmount
            key={amount}
            cents={amount}
            selected={cents === amount}
            // 1000 -> "10.00": the same text the user could have typed.
            onPress={() => onValueChange(formatCents(amount).slice(1).replace(/,/g, ''))}
          />
        ))}
      </View>
    </View>
  );
}

function QuickAmount({ cents, selected, onPress }: { cents: number; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  // 1000 -> "$10", 1050 -> "$10.50"
  const label = formatCents(cents).replace(/\.00$/, '');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.quick,
        selected ? styles.quickSelected : null,
        pressed && !selected ? { backgroundColor: colors.brandSoft } : null,
      ]}
    >
      <Text style={[styles.quickText, selected ? styles.quickTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = createStyles(({ colors, radius, type }) =>
  StyleSheet.create({
    wrap: { gap: 8, alignSelf: 'stretch' },
    label: { ...type.fieldLabel, color: colors.text },
    // The padding makes up for the border, so the amount doesn't move when it thickens.
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 17,
      paddingHorizontal: 19,
      borderRadius: radius.card,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    cardFocused: { borderWidth: 2, borderColor: colors.brandText, paddingVertical: 16, paddingHorizontal: 18 },
    cardError: { borderWidth: 2, borderColor: colors.danger, paddingVertical: 16, paddingHorizontal: 18 },
    dollar: { ...type.balance, color: colors.muted, includeFontPadding: false },
    input: {
      ...type.balance,
      flex: 1,
      height: 48,
      padding: 0,
      color: colors.text,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    error: { ...type.captionStrong, color: colors.danger },
    quickRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    quick: {
      flex: 1,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.quickAmount,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    quickSelected: { borderWidth: 2, borderColor: colors.brandText, backgroundColor: colors.brandSoft },
    quickText: { ...type.money, color: colors.text },
    quickTextSelected: { color: colors.brandText },
  }),
);
