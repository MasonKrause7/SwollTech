import type { ReactNode } from "react";
import { Image, Text, View, type ImageSourcePropType } from "react-native";
import { art } from "../art";
import { fonts, space, useTheme } from "../theme";
import { T } from "./ui";

export function Mark({ size = 44 }: { size?: number }) {
  return <Image source={art.mark} accessible={false} style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }} />;
}

export function Wordmark({ size = 28, color }: { size?: number; color?: string }) {
  const theme = useTheme();
  return (
    <Text style={{ fontFamily: fonts.display, fontSize: size, lineHeight: size + 4, color: color ?? theme.text, letterSpacing: 1.2 }}>
      SWOLLTECH
    </Text>
  );
}

/** Face plus the name, for screens that do not already show a full illustration. */
export function Lockup({ caption }: { caption?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <Mark size={52} />
      <View style={{ gap: 2, flex: 1 }}>
        <Wordmark size={30} />
        {caption ? <T variant="small">{caption}</T> : null}
      </View>
    </View>
  );
}

/** Dark hero: the character carries the empty state, the copy sits underneath. */
export function MascotPoster({ source, title, body, action }: { source: ImageSourcePropType; title: string; body: string; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ borderRadius: 20, overflow: "hidden", backgroundColor: "#0F1011", borderWidth: 1, borderColor: theme.line }}>
      <Image source={source} accessible={false} style={{ width: "100%", height: 210 }} resizeMode="cover" />
      <View style={{ padding: space.lg, gap: space.md }}>
        <T variant="heading" style={{ color: "#F4F4F2" }}>
          {title}
        </T>
        <T variant="muted" style={{ color: "#8E9196" }}>
          {body}
        </T>
        {action}
      </View>
    </View>
  );
}
