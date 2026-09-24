// A Home shortcut: a coloured circle inside a white one, with a label.
// send = paper plane, receive = arrow into a tray (never diagonal arrows).

import { Clock, Download, Send, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createStyles, useTheme } from '@/theme/theme';

export type ActionKind = 'send' | 'receive' | 'history' | 'security';

const ICONS: Record<ActionKind, LucideIcon> = {
  send: Send,
  receive: Download,
  history: Clock,
  security: ShieldCheck,
};

interface Props {
  kind: ActionKind;
  label: string;
  onPress?: () => void;
}

export function ActionCircle({ kind, label, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const Icon = ICONS[kind];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.action}
    >
      {({ pressed }) => (
        <>
          {/* Pressed: only the white ring darkens. The colour and label never fade. */}
          <View style={[styles.outer, pressed && styles.outerPressed]}>
            <View style={[styles.inner, { backgroundColor: colors[kind] }]}>
              <Icon size={20} color={colors.onAction} strokeWidth={2} />
            </View>
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const useStyles = createStyles(({ colors, type }) =>
  StyleSheet.create({
    action: { alignItems: 'center', gap: 8, flex: 1 },
    outer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    outerPressed: { backgroundColor: colors.line },
    inner: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    label: { ...type.label, color: colors.text },
  }),
);
