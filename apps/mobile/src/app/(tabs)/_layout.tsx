import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components';
import { Colors, Fonts } from '@/theme';

/**
 * Bottom tab navigator — the five screens from the design (Today, Studies,
 * Practice, Results, Profile) with a custom dark/gold tab bar.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.tabInactive,
        sceneStyle: { backgroundColor: Colors.bg },
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.goldBorderSoft,
          borderTopWidth: 1,
          height: 56 + bottomPad,
          paddingTop: 8,
          paddingBottom: bottomPad,
        },
        tabBarLabelStyle: {
          fontFamily: Fonts.sansSemibold,
          fontSize: 9.5,
          letterSpacing: 0.2,
        },
      }}>
      <Tabs.Screen name="index" options={tab('Today', 'home')} />
      <Tabs.Screen name="studies" options={tab('Studies', 'search')} />
      <Tabs.Screen name="practice" options={tab('Practice', 'mic')} />
      <Tabs.Screen name="results" options={tab('Results', 'award')} />
      <Tabs.Screen name="profile" options={tab('Profile', 'user')} />
    </Tabs>
  );
}

function tab(title: string, icon: IconName) {
  return {
    title,
    tabBarIcon: ({ color }: { color: ColorValue }) => (
      <Icon name={icon} color={color as string} size={23} strokeWidth={1.7} />
    ),
  };
}
