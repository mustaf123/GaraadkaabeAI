// Component gallery (development builds only; the root layout guards this route
// with __DEV__ too). Every shared component in every state, with the screenshot in
// design/screenshots to compare it with. The Appearance switch at the top is the
// real setting, so the choice stays after a restart.
//
// Sample data only: nothing here talks to Supabase.

import { Redirect, router } from 'expo-router';
import {
  Bell,
  ChevronLeft,
  Clock,
  Eye,
  EyeOff,
  FingerprintPattern,
  House,
  Settings,
  UserRound,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionCircle } from '@/components/ActionCircle';
import { AmountInput } from '@/components/AmountInput';
import { BalanceCard } from '@/components/BalanceCard';
import { BottomSheet } from '@/components/BottomSheet';
import { Checkbox } from '@/components/Checkbox';
import { IconButton } from '@/components/IconButton';
import { Keypad } from '@/components/Keypad';
import { LogoMark } from '@/components/LogoMark';
import { OrDivider } from '@/components/OrDivider';
import { PhoneInput } from '@/components/PhoneInput';
import { PinBoxes } from '@/components/PinBoxes';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ReceiveSheet } from '@/components/ReceiveSheet';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SegmentedControl } from '@/components/SegmentedControl';
import { StepProgress } from '@/components/StepProgress';
import { TabBar } from '@/components/TabBar';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { Toggle } from '@/components/Toggle';
import { TransactionRow } from '@/components/TransactionRow';
import { WalletNumberCard } from '@/components/WalletNumberCard';
import { usePinInput } from '@/hooks/usePinInput';
import { formatMoney, maskPhone } from '@/lib/format';
import { useAppearance, type AppearancePreference } from '@/stores/appearance';
import { createStyles, useTheme } from '@/theme/theme';
import type { ThemeColors } from '@/theme/tokens';

const APPEARANCE = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

const DIRECTIONS = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
] as const;

const TRANSACTIONS = [
  { direction: 'sent', counterparty: '61X XXX 4521', when: 'Today, 19:12', amount: '10.00' },
  { direction: 'received', counterparty: '61X XXX 7710', when: 'Today, 14:05', amount: '25.00' },
  { direction: 'sent', counterparty: '61X XXX 3308', when: 'Yesterday, 20:41', amount: '5.50' },
] as const;

const TABS = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'history', label: 'History', icon: Clock },
  { key: 'alerts', label: 'Alerts', icon: Bell, badge: 3 },
  { key: 'profile', label: 'Profile', icon: UserRound },
];

const SWATCHES: (keyof ThemeColors)[] = [
  'bg', 'surface', 'sheet', 'text', 'muted', 'line', 'brand', 'brandText', 'brandSoft', 'accent',
  'positive', 'danger', 'dangerSoft', 'badge', 'cardBg', 'cardText', 'pinEmpty', 'segmentTrack',
  'toggleOn', 'toggleOff', 'checkOn', 'send', 'receive', 'history', 'security',
];

export default function GalleryRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Gallery />;
}

function Gallery() {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const { preference, setPreference } = useAppearance();

  const pin = usePinInput();
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [keypadSize, setKeypadSize] = useState<'regular' | 'compact'>('regular');
  const [hideBalance, setHideBalance] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [direction, setDirection] = useState<'all' | 'sent' | 'received'>('all');
  const [fingerprint, setFingerprint] = useState(true);
  const [notifications, setNotifications] = useState(false);
  const [tab, setTab] = useState('home');
  const [sheet, setSheet] = useState<'receive' | 'delete' | null>(null);
  const [phone, setPhone] = useState('615552046');
  const [receiver, setReceiver] = useState('615554521');
  const [code, setCode] = useState('K7M2-9QXA');
  const [newPin, setNewPin] = useState('4829');
  const [newPin2, setNewPin2] = useState('4829');
  const [amount, setAmount] = useState('10.00');
  const [amountError, setAmountError] = useState(false);
  const [saved, setSaved] = useState(false);

  const sheets = (
    <>
      <ReceiveSheet visible={sheet === 'receive'} onClose={() => setSheet(null)} phone="615552046" />

      <BottomSheet visible={sheet === 'delete'} onClose={() => setSheet(null)} label="Delete account">
        <Text style={[styles.t.sheetTitle, { color: colors.text }]}>Delete your account?</Text>
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            You still have <Text style={styles.warnStrong}>$121.50</Text>. Send it to another wallet first. An account
            with money in it cannot be deleted.
          </Text>
        </View>
        <PrimaryButton title="Delete account" tone="danger" disabled />
        <SecondaryButton title="Cancel" variant="plain" onPress={() => setSheet(null)} />
      </BottomSheet>
    </>
  );

  return (
    <Screen scroll contentStyle={styles.content} overlay={sheets}>
        <View style={styles.header}>
          <IconButton icon={ChevronLeft} label="Back" onPress={() => router.back()} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Component gallery</Text>
            <Text style={styles.caption}>Dev only · showing {scheme}</Text>
          </View>
        </View>

        <Section title="Appearance" compare="the setting from Profile > Preferences (saved on this phone)">
          <SegmentedControl<AppearancePreference>
            options={APPEARANCE}
            value={preference}
            onChange={setPreference}
            label="Appearance"
            size="compact"
          />
          <Text style={styles.caption}>
            System follows the phone and switches live. Try it: pick System, then change the phone&apos;s dark mode.
          </Text>
        </Section>

        <Section title="Colours" compare="CLAUDE.md §4">
          <View style={styles.swatches}>
            {SWATCHES.map((key) => (
              <View key={key} style={styles.swatch}>
                <View style={[styles.swatchColor, { backgroundColor: colors[key] }]} />
                <Text style={styles.swatchLabel} numberOfLines={1}>
                  {key}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Text" compare="CreatePin.png, Home.png">
          <Text style={[styles.t.title, { color: colors.text }]}>Create a 4-digit PIN</Text>
          <Text style={[styles.t.body, { color: colors.muted }]}>
            You will use it to log in. Avoid easy PINs like 1234 or 1111.
          </Text>
          <Text style={[styles.t.balance, { color: colors.text }]}>{formatMoney('1234.5')}</Text>
          <Text style={[styles.t.section, { color: colors.text }]}>Transactions</Text>
          <Text style={[styles.t.caption, { color: colors.muted }]}>Caption 13 · Today, 19:12</Text>
        </Section>

        <Section title="StepProgress + IconButton" compare="CreatePin.png, Home.png (header)">
          <View style={styles.row}>
            <IconButton icon={ChevronLeft} label="Back" />
            <View style={styles.flex} />
            <IconButton icon={Bell} label="Notifications" shape="round" badge={3} />
            <IconButton icon={Settings} label="Settings" shape="round" />
          </View>
          <StepProgress step={2} total={3} />
        </Section>

        <Section title="PinBoxes + Keypad (try it)" compare="CreatePin.png, ConfirmPin.png, Login.png (compact keys)">
          <PinBoxes
            value={pin.value}
            show={showPin}
            onToggleShow={() => setShowPin((s) => !s)}
            error={pinError}
          />
          <Keypad
            size={keypadSize}
            onDigit={(d) => {
              setPinError(null);
              pin.append(d);
            }}
            onDelete={() => {
              setPinError(null);
              pin.remove();
            }}
          />
          <SegmentedControl
            options={[{ value: 'regular', label: 'Keys 60' }, { value: 'compact', label: 'Keys 50' }] as const}
            value={keypadSize}
            onChange={setKeypadSize}
            label="Key size"
            size="compact"
          />
          <View style={styles.row}>
            <View style={styles.flex}>
              <SecondaryButton title="Show error" onPress={() => setPinError("PINs don't match. Try again.")} />
            </View>
            <View style={styles.flex}>
              <SecondaryButton
                title="Clear"
                onPress={() => {
                  setPinError(null);
                  pin.clear();
                }}
              />
            </View>
          </View>
          <Text style={styles.caption}>All states at once:</Text>
          <PinBoxes value="" label="Empty, active" />
          <PinBoxes value="48" label="Two digits" />
          <PinBoxes value="4829" label="Full, hidden" />
          <PinBoxes value="4829" label="Full, shown" show />
          <PinBoxes value="4829" label="Error" error="Wrong PIN. 2 attempts left." />
        </Section>

        <Section title="PhoneInput (try it)" compare="Phone.png, SendMoney.png, ForgotPin.png">
          <Text style={styles.caption}>Tap a field: the border turns thick green while you type.</Text>
          <PhoneInput value={phone} onValueChange={setPhone} hint="9 digits, for example 61 234 5678" />
          <PhoneInput
            label="Receiver's phone number"
            value={receiver}
            onValueChange={setReceiver}
            success={receiver.length === 9 ? `Registered wallet · ${maskPhone(receiver)}` : null}
            hint="The receiver's 9-digit number"
          />
          <PhoneInput label="Error" value="61555" onValueChange={() => {}} error="Enter a valid 9-digit number" />
          <PhoneInput label="Empty (placeholder)" value="" onValueChange={() => {}} />
        </Section>

        <Section title="TextField (try it)" compare="ForgotPin.png">
          <TextField
            label="Recovery code"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
          />
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField
                label="New PIN"
                value={newPin}
                onChangeText={(t) => setNewPin(t.replace(/D/g, ''))}
                placeholder="4 digits"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
              />
            </View>
            <View style={styles.flex}>
              <TextField
                label="Confirm new PIN"
                value={newPin2}
                onChangeText={(t) => setNewPin2(t.replace(/D/g, ''))}
                placeholder="4 digits"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
              />
            </View>
          </View>
          <TextField label="Error" value="K7M2-0000" error="Wrong recovery code. 2 attempts left" />
          <TextField label="Hint" value="" placeholder="XXXX-XXXX" hint="8 letters and digits, from when you registered" />
        </Section>

        <Section title="AmountInput (try it)" compare="SendMoney.png">
          <AmountInput value={amount} onValueChange={setAmount} error={amountError ? 'Insufficient balance' : null} />
          <Text style={styles.caption}>
            Value: &quot;{amount}&quot;. Try 10.555, a second dot or 11 digits: the edit is ignored.
          </Text>
          <SecondaryButton title={amountError ? 'Hide error' : 'Show error'} onPress={() => setAmountError((e) => !e)} />
        </Section>

        <Section title="Checkbox" compare="RecoveryCode.png">
          <Checkbox value={saved} onValueChange={setSaved} label="I have written down my recovery code" />
          <PrimaryButton title="Continue" disabled={!saved} onPress={() => {}} />
          <Checkbox value onValueChange={() => {}} label="Ticked" />
          <Checkbox value={false} onValueChange={() => {}} label="Disabled" disabled />
        </Section>

        <Section title="OrDivider" compare="Login.png">
          <PrimaryButton title="Login" disabled />
          <OrDivider />
          <SecondaryButton title="Use your fingerprint" icon={FingerprintPattern} onPress={() => {}} />
        </Section>

        <Section title="PrimaryButton + SecondaryButton" compare="CreatePin.png, Login.png, Profile-delete.png">
          <PrimaryButton title="Continue" onPress={() => {}} />
          <PrimaryButton title="Continue" disabled />
          <PrimaryButton title="Send" loading />
          <SecondaryButton title="Use your fingerprint" icon={FingerprintPattern} onPress={() => {}} />
          <PrimaryButton title="Delete account" tone="danger" onPress={() => {}} />
          <PrimaryButton title="Delete account" tone="danger" disabled />
          <SecondaryButton title="Cancel" variant="plain" onPress={() => {}} />
        </Section>

        <Section title="BalanceCard" compare="Home.png">
          <BalanceCard
            balance="121.50"
            todayIn="15.00"
            hidden={hideBalance}
            onToggleHidden={() => setHideBalance((h) => !h)}
          />
        </Section>

        <Section title="ActionCircle" compare="Home.png">
          <View style={styles.row}>
            <ActionCircle kind="send" label="Send" />
            <ActionCircle kind="receive" label="Receive" onPress={() => setSheet('receive')} />
            <ActionCircle kind="history" label="History" />
            <ActionCircle kind="security" label="Security" />
          </View>
        </Section>

        <Section title="LogoMark" compare="Logo.png, Home.png">
          <View style={styles.row}>
            <LogoMark size={84} />
            <LogoMark size={64} />
            <LogoMark size={44} />
          </View>
          <View style={styles.row}>
            <View style={[styles.logoBox, { backgroundColor: colors.logoGreen }]}>
              <LogoMark size={64} variant="white" />
            </View>
            <View style={[styles.logoBox, { backgroundColor: colors.promoBg }]}>
              <LogoMark size={44} variant="white" />
            </View>
          </View>
        </Section>

        <Section title="WalletNumberCard" compare="Home.png (Share opens the Receive sheet)">
          <WalletNumberCard phone="615552046" onShare={() => setSheet('receive')} />
        </Section>

        <Section title="TransactionRow (home)" compare="Home.png">
          <View style={styles.transactionsHeader}>
            <Text style={[styles.t.section, { color: colors.text }]}>Transactions</Text>
            <IconButton
              icon={hideAmounts ? EyeOff : Eye}
              label={hideAmounts ? 'Show amounts' : 'Hide amounts'}
              shape="plain"
              onPress={() => setHideAmounts((h) => !h)}
            />
            <View style={styles.flex} />
            <TextLink title="See all" onPress={() => {}} />
          </View>
          {TRANSACTIONS.map((t) => (
            <TransactionRow key={t.counterparty} {...t} hideAmount={hideAmounts} onPress={() => {}} />
          ))}
        </Section>

        <Section title="SegmentedControl + TransactionRow (list)" compare="History.png">
          <SegmentedControl options={DIRECTIONS} value={direction} onChange={setDirection} label="Show" />
          <Text style={styles.overline}>Today</Text>
          <View style={styles.card}>
            {TRANSACTIONS.filter((t) => direction === 'all' || t.direction === direction).map((t) => (
              <TransactionRow key={t.counterparty} {...t} size="list" onPress={() => {}} />
            ))}
          </View>
        </Section>

        <Section title="Toggle" compare="Profile.png">
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Fingerprint login</Text>
              <Toggle value={fingerprint} onValueChange={setFingerprint} label="Fingerprint login" />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Notifications</Text>
              <Toggle value={notifications} onValueChange={setNotifications} label="Notifications" />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Disabled</Text>
              <Toggle value onValueChange={() => {}} label="Disabled example" disabled />
            </View>
          </View>
        </Section>

        <Section title="BottomSheet" compare="Home-receive.png, Profile-delete.png">
          <SecondaryButton title="Open Receive sheet" onPress={() => setSheet('receive')} />
          <SecondaryButton title="Open Delete sheet" onPress={() => setSheet('delete')} />
        </Section>

        <Section title="TabBar" compare="Home.png (bottom)">
          <View style={styles.tabBarBox}>
            <TabBar items={TABS} activeKey={tab} onPress={setTab} />
          </View>
        </Section>
    </Screen>
  );
}

function Section({ title, compare, children }: { title: string; compare: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.overline}>{title}</Text>
      <Text style={styles.caption}>compare: {compare}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const useStyles = createStyles(({ colors, radius, type }) => ({
  t: type,
  ...StyleSheet.create({
    content: { paddingBottom: 48, gap: 28 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerText: { gap: 2 },
    headerTitle: { ...type.header, color: colors.text },
    caption: { ...type.caption, color: colors.muted },
    overline: { ...type.overline, color: colors.muted },
    section: { gap: 4 },
    sectionBody: { gap: 12, marginTop: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    transactionsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    flex: { flex: 1 },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    swatch: { width: 76, gap: 4 },
    swatchColor: { height: 36, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
    swatchLabel: { ...type.caption, fontSize: 11, color: colors.muted },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radius.card,
      paddingVertical: 4,
      paddingHorizontal: 16,
    },
    settingRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 12 },
    settingLabel: { ...type.bodyStrong, color: colors.text, flex: 1 },
    logoBox: { width: 104, height: 104, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
    tabBarBox: { borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
    warn: { alignSelf: 'stretch', padding: 14, paddingHorizontal: 16, borderRadius: radius.button, backgroundColor: colors.warnSoft },
    warnText: { ...type.body, fontSize: 14, fontFamily: type.captionStrong.fontFamily, color: colors.warnText },
    warnStrong: { fontFamily: type.bodyStrong.fontFamily },
  }),
}));
