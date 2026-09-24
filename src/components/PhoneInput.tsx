// Phone number field (Phone, Send money, Forgot PIN): a fixed "+252", a divider,
// then the local number shown as "61 555 2046". The screen gets and sets the plain
// 9 digits ("615552046"); typing stops at 9 and a pasted +252 number is cleaned.

import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { formatPhoneInput, phoneDigits } from '@/lib/input';
import { createStyles } from '@/theme/theme';
import { FieldFrame, useFieldInputColors } from './TextField';

interface Props {
  label?: string;
  // The 9 digits, without +252.
  value: string;
  onValueChange: (digits: string) => void;
  hint?: string | null;
  success?: string | null;
  error?: string | null;
  autoFocus?: boolean;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  testID?: string;
}

export function PhoneInput({
  label = 'Phone number',
  value,
  onValueChange,
  hint,
  success,
  error,
  autoFocus,
  returnKeyType,
  onSubmitEditing,
  testID,
}: Props) {
  const styles = useStyles();
  const inputColors = useFieldInputColors();
  const [focused, setFocused] = useState(false);

  return (
    <FieldFrame label={label} focused={focused} hint={hint} success={success} error={error}>
      <View style={styles.prefix} aria-hidden>
        <Text style={styles.prefixText}>+252</Text>
      </View>
      <TextInput
        testID={testID}
        accessibilityLabel={`${label}, after +252`}
        {...inputColors}
        value={formatPhoneInput(value)}
        onChangeText={(text) => onValueChange(phoneDigits(text))}
        placeholder="61 234 5678"
        keyboardType="number-pad"
        autoComplete="tel-national"
        textContentType="telephoneNumber"
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.input}
      />
    </FieldFrame>
  );
}

const useStyles = createStyles(({ colors, type }) =>
  StyleSheet.create({
    prefix: {
      alignSelf: 'stretch',
      justifyContent: 'center',
      paddingHorizontal: 13,
      borderRightWidth: 1,
      borderRightColor: colors.line,
    },
    prefixText: { ...type.button, color: colors.text },
    input: {
      ...type.input,
      flex: 1,
      alignSelf: 'stretch',
      paddingHorizontal: 14,
      paddingVertical: 0,
      letterSpacing: 0.7,
      color: colors.text,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
  }),
);
