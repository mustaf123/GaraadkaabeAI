// "Receive money": the user's full number and a Copy button (Home-receive.png).
// Opened by the Receive circle and the Share button on Home.

import * as Clipboard from 'expo-clipboard';
import { Download } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatPhone } from '@/lib/format';
import { createStyles, useTheme } from '@/theme/theme';
import { BottomSheet } from './BottomSheet';
import { PrimaryButton } from './PrimaryButton';
import { SecondaryButton } from './SecondaryButton';

interface Props {
  visible: boolean;
  onClose: () => void;
  // 9 digits, e.g. "615552046"
  phone: string;
}

export function ReceiveSheet({ visible, onClose, phone }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const number = formatPhone(phone);
  const [copied, setCopied] = useState(false);

  // Each opening starts with "Copy number" again.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setCopied(false);
  }

  const copy = async () => {
    await Clipboard.setStringAsync(`+252${phone}`);
    setCopied(true);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} label="Receive money">
      <View style={styles.icon}>
        <Download size={28} color={colors.onAction} strokeWidth={2.2} />
      </View>
      <Text style={styles.title}>Receive money</Text>
      <Text style={styles.body}>
        Share your number. Anyone with GaraadKaabeAI can send money to it, and it arrives instantly.
      </Text>
      <View style={styles.numberBox}>
        <Text style={styles.number} numberOfLines={1} adjustsFontSizeToFit>
          {number}
        </Text>
      </View>
      <PrimaryButton title={copied ? 'Copied' : 'Copy number'} onPress={copy} />
      <SecondaryButton title="Close" variant="plain" onPress={onClose} />
    </BottomSheet>
  );
}

const useStyles = createStyles(({ colors, radius, type }) =>
  StyleSheet.create({
    icon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      marginTop: 8,
      backgroundColor: colors.receive,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { ...type.sheetTitle, color: colors.text },
    body: { ...type.body, color: colors.muted, textAlign: 'center' },
    numberBox: { alignSelf: 'stretch', padding: 18, borderRadius: radius.pin, backgroundColor: colors.surface },
    number: { ...type.sheetTitle, fontSize: 24, lineHeight: 30, letterSpacing: 0.96, color: colors.text, textAlign: 'center' },
  }),
);
