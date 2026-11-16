import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { fontFamilies, useAppTheme } from '@/theme';
import { useHeaderOptions } from '@/theme/navigation';

function icon(name: IconName) {
  function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} size={22} color={color} />;
  }
  return TabIcon;
}

/**
 * Teacher bottom navigation — only modules that work today. A route group:
 * URLs stay /teacher, /teacher/classes, /teacher/sessions. In the RTL layout
 * the first tab (home) sits on the right. Detail screens (a class, a student,
 * a session) are pushed on the parent stack, above the tab bar.
 */
export default function TeacherTabsLayout() {
  const { colors } = useAppTheme();
  const headerOptions = useHeaderOptions();
  return (
    <Tabs
      screenOptions={{
        ...headerOptions,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fontFamilies.medium, fontSize: 12 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: ar.tabs.home,
          headerShown: false,
          tabBarIcon: icon('home'),
          tabBarAccessibilityLabel: ar.tabs.home,
        }}
      />
      <Tabs.Screen name="classes" options={{ title: ar.tabs.classes, tabBarIcon: icon('students'), tabBarAccessibilityLabel: ar.tabs.classes }} />
      <Tabs.Screen name="sessions" options={{ title: ar.tabs.sessions, tabBarIcon: icon('calendar'), tabBarAccessibilityLabel: ar.tabs.sessions }} />
    </Tabs>
  );
}
