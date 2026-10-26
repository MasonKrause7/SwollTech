import { useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { describeSync } from "../logic/status";
import { useSyncState } from "../sync";
import { fonts, radius, space, touch, useTheme, type Palette } from "../theme";

export function useStyles<T>(factory: (theme: Palette) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  edges = ["top"],
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ("top" | "bottom")[];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[{ padding: space.lg, paddingBottom: 120, gap: space.md }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={theme.muted} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, padding: space.lg, gap: space.md }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

type Variant = "title" | "heading" | "body" | "muted" | "small" | "number" | "label";

export function T({ children, variant = "body", style, numberOfLines }: { children: ReactNode; variant?: Variant; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const theme = useTheme();
  const base: Record<Variant, TextStyle> = {
    title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, color: theme.text, letterSpacing: -0.5 },
    heading: { fontFamily: fonts.displaySemi, fontSize: 24, lineHeight: 28, color: theme.text },
    body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: theme.text },
    muted: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: theme.muted },
    small: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: theme.muted },
    number: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: theme.text, fontVariant: ["tabular-nums"] },
    label: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 18, color: theme.muted },
  };
  return (
    <Text style={[base[variant], style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  kind = "primary",
  disabled,
  busy,
  style,
  testID,
  compact,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  compact?: boolean;
}) {
  const theme = useTheme();
  const colors = {
    primary: { bg: theme.accent, fg: theme.accentInk, border: theme.accent },
    secondary: { bg: theme.raised, fg: theme.text, border: theme.line },
    danger: { bg: "transparent", fg: theme.danger, border: theme.danger },
    ghost: { bg: "transparent", fg: theme.text, border: "transparent" },
  }[kind];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: compact ? 40 : touch,
          paddingHorizontal: compact ? space.md : space.lg,
          borderRadius: radius.md,
          backgroundColor: colors.bg,
          borderWidth: 1.5,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <Text style={{ color: colors.fg, fontFamily: fonts.bodySemi, fontSize: compact ? 15 : 17 }}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style, onPress, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string }) {
  const theme = useTheme();
  const body = [{ backgroundColor: theme.raised, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.line, padding: space.lg, gap: space.sm }, style];
  if (!onPress) return <View style={body}>{children}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [body, { opacity: pressed ? 0.85 : 1 }]}>
      {children}
    </Pressable>
  );
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  const theme = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <T variant="label">{label}</T>
      <TextInput
        placeholderTextColor={theme.muted}
        accessibilityLabel={label}
        {...props}
        style={[
          {
            minHeight: touch,
            backgroundColor: theme.raised,
            borderWidth: 1.5,
            borderColor: error ? theme.danger : theme.line,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            color: theme.text,
            fontFamily: fonts.body,
            fontSize: 17,
          },
          props.style,
        ]}
      />
      {error ? <T variant="small" style={{ color: theme.danger }}>{error}</T> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress: () => void; testID?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={{
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: selected ? theme.accent : theme.line,
        backgroundColor: selected ? theme.accent : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: selected ? theme.accentInk : theme.text, fontFamily: fonts.displaySemi, fontSize: 18 }}>{label}</Text>
    </Pressable>
  );
}

/** Big number input with minus and plus buttons on either side. */
export function Stepper({
  label,
  value,
  onChange,
  onStep,
  suffix,
  keyboardType = "decimal-pad",
  testID,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  onStep: (direction: -1 | 1) => void;
  suffix?: string;
  keyboardType?: "decimal-pad" | "number-pad";
  testID?: string;
}) {
  const theme = useTheme();
  const button = (direction: -1 | 1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${direction < 0 ? "Decrease" : "Increase"} ${label.toLowerCase()}`}
      onPress={() => onStep(direction)}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 56,
        height: 64,
        borderRadius: radius.md,
        backgroundColor: pressed ? theme.line : theme.track,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <Text style={{ color: theme.text, fontFamily: fonts.display, fontSize: 30 }}>{direction < 0 ? "−" : "+"}</Text>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, gap: space.xs }}>
      <T variant="label">{label}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        {button(-1)}
        <View style={{ flex: 1, alignItems: "center" }}>
          <TextInput
            testID={testID}
            accessibilityLabel={label}
            value={value}
            onChangeText={onChange}
            keyboardType={keyboardType}
            selectTextOnFocus
            placeholder="0"
            placeholderTextColor={theme.muted}
            style={{ color: theme.text, fontFamily: fonts.display, fontSize: 44, textAlign: "center", minWidth: 70, paddingVertical: 2, fontVariant: ["tabular-nums"] }}
          />
          {suffix ? <T variant="small">{suffix}</T> : null}
        </View>
        {button(1)}
      </View>
    </View>
  );
}

export function SyncPill({ onPress }: { onPress?: () => void }) {
  const theme = useTheme();
  const { state, pending } = useSyncState();
  const { label, tone } = describeSync(state, pending);
  const color = tone === "ok" ? theme.ok : tone === "bad" ? theme.danger : theme.muted;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}. Sync now`} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <T variant="small" numberOfLines={1} style={{ color: tone === "bad" ? theme.danger : theme.muted }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.line, borderRadius: radius.lg, padding: space.xl, gap: space.sm }}>
      <T variant="heading">{title}</T>
      <T variant="muted">{body}</T>
      {action}
    </View>
  );
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space.lg, paddingBottom: space.sm }}>
          <T variant="heading">{title}</T>
          <Button label="Close" kind="ghost" compact onPress={onClose} />
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaView>
    </Modal>
  );
}

export function Stat({ value, label, accent }: { value: string; label: string; accent?: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: accent ?? theme.text, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <T variant="small">{label}</T>
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.line }} />;
}
