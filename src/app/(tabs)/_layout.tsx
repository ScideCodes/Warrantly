import { Tabs } from 'expo-router/tabs';
import { Dock, InDock } from '@/components/Dock';
import { reduceMotion } from '@/components/ui';
import { colors } from '@/theme';

// The three main pages share one dock that stays on screen; switching slides the page sideways.
export default function TabsLayout() {
  return (
    <InDock.Provider value>
    <Tabs
      tabBar={(props) => <Dock {...props} />}
      screenOptions={{ headerShown: false, animation: reduceMotion() ? 'none' : 'shift', tabBarHideOnKeyboard: true, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Warrantly' }} />
      <Tabs.Screen name="add" />
      <Tabs.Screen name="settings" />
    </Tabs>
    </InDock.Provider>
  );
}
