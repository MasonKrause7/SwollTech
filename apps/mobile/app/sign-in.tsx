import { Link } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { devLoginEnabled, missingReleaseConfig } from "../src/api";
import { art } from "../src/art";
import { useAuth } from "../src/auth";
import { Wordmark } from "../src/components/brand";
import { Button, Field, T } from "../src/components/ui";
import { fonts, space, useTheme } from "../src/theme";

export default function SignIn() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, devSignIn, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  }

  async function local() {
    setBusy(true);
    setError(await devSignIn(email));
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom, space.lg) }}>
        <View style={{ height: 360, backgroundColor: "#0F1011" }}>
          <Image source={art.deadlift} accessible={false} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 170 }}>
            {Array.from({ length: 8 }, (_, step) => (
              <View key={step} style={{ flex: 1, backgroundColor: `rgba(15,16,17,${(step / 7) * 0.92})` }} />
            ))}
          </View>
          <View style={{ position: "absolute", left: space.lg, right: space.lg, bottom: space.lg, gap: 6 }}>
            <Wordmark size={40} color="#F4F4F2" />
            <Text style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: "#C8C9C6", maxWidth: 280 }}>
              Write it down. Lift it. Beat it next week.
            </Text>
          </View>
        </View>

        <View style={{ padding: space.lg, gap: space.md }}>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
          {error ? <T style={{ color: theme.danger }}>{error}</T> : null}
          {!configured && !devLoginEnabled ? (
            <T variant="small">Sign in is not set up in this build. Set EXPO_PUBLIC_NEON_AUTH_URL.</T>
          ) : null}
          {missingReleaseConfig.length ? <T variant="small" style={{ color: theme.danger }}>This build is missing {missingReleaseConfig.join(", ")}.</T> : null}
          <Button label="Sign in" onPress={submit} busy={busy} testID="sign-in" />
          {devLoginEnabled ? <Button label="Continue with local account" kind="secondary" onPress={local} disabled={busy} /> : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.sm }}>
            <Link href="/sign-up" style={{ color: theme.text, fontSize: 16, paddingVertical: 12 }}>
              Create account
            </Link>
            <Link href="/reset" style={{ color: theme.muted, fontSize: 16, paddingVertical: 12 }}>
              Forgot password
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
