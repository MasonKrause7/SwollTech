import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { fonts, useTheme } from "../theme";

const LABELS: Record<string, string> = {
  index: "Today",
  workouts: "Workouts",
  history: "History",
  progress: "Progress",
  account: "Account",
};

function Icon({ name, color }: { name: string; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {name === "index" ? (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Circle cx={12} cy={12} r={2.5} {...stroke} />
        </>
      ) : null}
      {name === "workouts" ? <Path d="M4 6h16M4 12h16M4 18h10" {...stroke} /> : null}
      {name === "history" ? (
        <>
          <Rect x={3.5} y={5} width={17} height={15} rx={2} {...stroke} />
          <Path d="M3.5 10h17M8 3v4M16 3v4" {...stroke} />
        </>
      ) : null}
      {name === "progress" ? <Path d="M4 19l5-6 4 3 7-9" {...stroke} /> : null}
      {name === "account" ? (
        <>
          <Circle cx={12} cy={8.5} r={4} {...stroke} />
          <Path d="M4.5 20c1.4-3.6 4.2-5.2 7.5-5.2s6.1 1.6 7.5 5.2" {...stroke} />
        </>
      ) : null}
    </Svg>
  );
}

export function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: theme.raised,
        borderTopWidth: 1,
        borderTopColor: theme.line,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 6,
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const color = focused ? theme.text : theme.muted;
        const label = LABELS[route.name] ?? route.name;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => navigateToTab(route.key)}
            style={{ flex: 1, alignItems: "center", gap: 3, minHeight: 52, justifyContent: "center" }}
          >
            <View style={{ height: 3, width: 22, borderRadius: 2, backgroundColor: focused ? theme.highlight : "transparent", marginBottom: 2 }} />
            <Icon name={route.name} color={color} />
            <Text style={{ color, fontFamily: focused ? fonts.bodySemi : fonts.bodyMedium, fontSize: 12 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
