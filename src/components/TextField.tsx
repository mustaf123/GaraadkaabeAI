// A labelled text field (56 high, radius 16), e.g. the recovery code and new PIN
// on Forgot PIN. Thin grey border; a thick green one while typing; a red one and
// the message below on error. Under the field: an error, else a green ✓ status,
// else a grey hint.
//
// Takes the usual TextInput props (keyboardType, secureTextEntry, maxLength, ...).
// FieldFrame and useFieldInputColors are shared with PhoneInput.

import { Check } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { createStyles, useTheme } from '@/theme/theme';

interface NoteProps {
  // Grey text under the field: "9 digits, for example 61 234 5678"
  hint?: string | null;
  // Green, with a tick: "Registered wallet · 61X XXX 4521"
  success?: string | null;
  // Red border and red text; wins over the other two.
  error?: string | null;
}

type InputProps = Omit<
  TextInputProps,
  'style' | 'placeholderTextColor' | 'selectionColor' | 'cursorColor' | 'selectionHandleColor' | 'keyboardAppearance'
>;

interface Props extends InputProps, NoteProps {
  label: string;
}

export function TextField({ label, hint, success, error, onFocus, onBlur, ...input }: Props) {
  const styles = useStyles();
  const inputColors = useFieldInputColors();
  const [focused, setFocused] = useState(false);

  return (
    <FieldFrame label={label} focused={focused} hint={hint} success={success} error={error}>
      <TextInput
        accessibilityLabel={label}
        {...inputColors}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={styles.input}
      />
    </FieldFrame>
  );
}

// Label, box and the note under it. The children go inside the box.
export function FieldFrame({ label, focused, hint, success, error, children }: NoteProps & { label: string; focused: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.wrap}>
      {/* The input itself carries the label for screen readers. */}
      <Text style={styles.label} aria-hidden>
        {label}
      </Text>
      <View style={[styles.box, focused && styles.boxFocused, error ? styles.boxError : null]}>{children}</View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : success ? (
        <View style={styles.success} accessibilityLiveRegion="polite">
          <Check size={16} color={colors.brandText} strokeWidth={2.2} />
          <Text style={styles.successText}>{success}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

// Placeholder, caret, selection and keyboard colours for the current theme.
export function useFieldInputColors() {
  const { colors, scheme } = useTheme();
  return {
    placeholderTextColor: colors.muted,
    // On Android selectionColor is the highlight behind selected text, so it is kept
    // see-through; on iOS it is also the caret.
    selectionColor: Platform.OS === 'ios' ? colors.brandText : colors.focusRing,
    cursorColor: colors.brandText,
    selectionHandleColor: colors.brandText,
    keyboardAppearance: scheme,
  } as const;
}

const useStyles = createStyles(({ colors, radius, type }) =>
  StyleSheet.create({
    wrap: { gap: 8, alignSelf: 'stretch' },
    label: { ...type.fieldLabel, color: colors.text },
    // The padding makes up for the border, so the text doesn't move when it thickens.
    box: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.input,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 1,
      overflow: 'hidden',
    },
    boxFocused: { borderWidth: 2, borderColor: colors.brandText, padding: 0 },
    boxError: { borderWidth: 2, borderColor: colors.danger, padding: 0 },
    input: {
      ...type.input,
      flex: 1,
      alignSelf: 'stretch',
      paddingHorizontal: 15,
      paddingVertical: 0,
      letterSpacing: 1,
      color: colors.text,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    hint: { ...type.caption, color: colors.muted },
    success: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    successText: { ...type.captionBold, color: colors.brandText, flexShrink: 1 },
    error: { ...type.captionStrong, color: colors.danger },
  }),
);
