// The bottom tab bar: same background as the page, no top border, active tab in
// the brand colour, an unread badge on Alerts. It only draws the bar; step 5 plugs
// it into the (tabs) layout.

import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStyles, useTheme } from '@/theme/theme';
import { Badge } from './Badge';

export interface TabItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface Props {
  items: TabItem[];
  activeKey: string;
  onPress: (key: string) => void;
}

export function TabBar({ items, activeKey, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: 14 + insets.bottom }]} accessibilityRole="tablist">
      {items.map(({ key, label, icon: Icon, badge = 0 }) => {
        const active = key === activeKey;
        const color = active ? colors.brandText : colors.muted;
        return (
          <Pressable
            key={key}
            onPress={() => onPress(key)}
            accessibilityRole="tab"
            accessibilityLabel={badge > 0 ? `${label}, ${badge} unread` : label}
            accessibilityState={{ selected: active }}
            style={styles.tab}
          >
            <Icon size={24} color={color} strokeWidth={2} />
            <Text style={[active ? styles.labelActive : styles.label, { color }]}>{label}</Text>
            <Badge count={badge} style={styles.badge} />
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = createStyles(({ colors, type }) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      backgroundColor: colors.bg,
      paddingTop: 8,
      paddingHorizontal: 12,
    },
    tab: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4 },
    label: type.tab,
    labelActive: type.tabActive,
    badge: { position: 'absolute', top: 0, left: '50%', marginLeft: 4 },
  }),
);
