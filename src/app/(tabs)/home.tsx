// Home (Home.png): greeting, balance, the four shortcuts, the wallet number,
// and the latest three transactions.
//
// Sample data for now (src/lib/sampleData.ts). Send, History, Security, the bell,
// settings, See all and the rows get their targets as those screens are built.

import { Bell, Eye, EyeOff, Settings, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionCircle } from '@/components/ActionCircle';
import { BalanceCard } from '@/components/BalanceCard';
import { IconButton } from '@/components/IconButton';
import { ReceiveSheet } from '@/components/ReceiveSheet';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { TransactionRow } from '@/components/TransactionRow';
import { WalletNumberCard } from '@/components/WalletNumberCard';
import { maskPhone } from '@/lib/format';
import { SAMPLE } from '@/lib/sampleData';
import { createStyles, useTheme } from '@/theme/theme';
import { fonts } from '@/theme/typography';

export default function Home() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [hideBalance, setHideBalance] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const openReceive = () => setReceiveOpen(true);

  return (
    <Screen
      scroll
      edges={['top']}
      contentStyle={styles.content}
      overlay={<ReceiveSheet visible={receiveOpen} onClose={() => setReceiveOpen(false)} phone={SAMPLE.phone} />}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
        >
          <UserRound size={24} color={colors.brandText} strokeWidth={2} />
        </Pressable>
        <View style={styles.greeting}>
          <Text style={styles.welcome}>Welcome back!</Text>
          <Text style={styles.phone}>{maskPhone(SAMPLE.phone)}</Text>
        </View>
        <IconButton icon={Bell} label="Notifications" shape="round" badge={SAMPLE.unread} />
        <IconButton icon={Settings} label="Settings" shape="round" />
      </View>

      <View style={styles.balance}>
        <BalanceCard
          balance={SAMPLE.balance}
          todayIn={SAMPLE.todayIn}
          hidden={hideBalance}
          onToggleHidden={() => setHideBalance((h) => !h)}
        />
      </View>

      <View style={styles.actions}>
        <ActionCircle kind="send" label="Send" />
        <ActionCircle kind="receive" label="Receive" onPress={openReceive} />
        <ActionCircle kind="history" label="History" />
        <ActionCircle kind="security" label="Security" />
      </View>

      <View style={styles.wallet}>
        <WalletNumberCard phone={SAMPLE.phone} onShare={openReceive} />
      </View>

      <View style={styles.transactionsHeader}>
        <Text style={styles.section} accessibilityRole="header">
          Transactions
        </Text>
        <IconButton
          icon={hideAmounts ? EyeOff : Eye}
          label={hideAmounts ? 'Show amounts' : 'Hide amounts'}
          shape="plain"
          onPress={() => setHideAmounts((h) => !h)}
        />
        <View style={styles.flex} />
        <TextLink title="See all" />
      </View>
      <View style={styles.list}>
        {SAMPLE.transactions.map(({ id, ...t }) => (
          <TransactionRow key={id} {...t} hideAmount={hideAmounts} />
        ))}
      </View>
    </Screen>
  );
}

const useStyles = createStyles(({ colors, type }) =>
  StyleSheet.create({
    content: { paddingTop: 20, paddingBottom: 16 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2,
      borderColor: colors.brandText,
      backgroundColor: colors.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarPressed: { backgroundColor: colors.line },
    greeting: { flex: 1, gap: 2 },
    welcome: { ...type.body, fontSize: 14, lineHeight: 18, color: colors.muted },
    phone: { fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 22, color: colors.text },
    balance: { marginTop: 20 },
    actions: { marginTop: 22, flexDirection: 'row', gap: 8 },
    wallet: { marginTop: 22 },
    transactionsHeader: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 10 },
    section: { ...type.section, color: colors.text },
    flex: { flex: 1 },
    list: { marginTop: 6 },
  }),
);
