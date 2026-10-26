import { Tabs } from "expo-router/js-tabs";
import { TabBar } from "../../src/components/TabBar";
import { useTheme } from "../../src/theme";

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.bg } }}>
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="workouts" options={{ title: "Workouts" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="progress" options={{ title: "Progress" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
    </Tabs>
  );
}
