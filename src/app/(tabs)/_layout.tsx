// The four tabs (Home · History · Alerts · Profile) with our own TabBar.
// A tab whose screen is not built yet shows in the bar but does nothing when pressed.

import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Bell, Clock, House, UserRound } from 'lucide-react-native';
import { TabBar, type TabItem } from '@/components/TabBar';
import { SAMPLE } from '@/lib/sampleData';

const TABS: TabItem[] = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'history', label: 'History', icon: Clock },
  { key: 'alerts', label: 'Alerts', icon: Bell, badge: SAMPLE.unread },
  { key: 'profile', label: 'Profile', icon: UserRound },
];

function AppTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <TabBar
      items={TABS}
      activeKey={state.routes[state.index].name}
      onPress={(key) => {
        if (state.routeNames.includes(key)) navigation.navigate(key);
      }}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <AppTabBar {...props} />}>
      <Tabs.Screen name="home" />
    </Tabs>
  );
}
