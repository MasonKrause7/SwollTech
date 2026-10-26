import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button, Field, Screen, T } from "../src/components/ui";
import { devLoginEnabled } from "../src/api";
import { useAuth } from "../src/auth";
import { space, useTheme } from "../src/theme";

export default function SignIn() {
  const theme = useTheme();
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]} contentStyle={{ paddingTop: 72, gap: space.lg }}>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: space.sm }}>
          {[theme.danger, "#1F6FD1", theme.accent, theme.ok].map((color) => (
            <View key={color} style={{ width: 10, height: 44, borderRadius: 3, backgroundColor: color }} />
          ))}
        </View>
        <T variant="title">SwollTech</T>
        <T variant="muted">Your training notebook. Log every set at the gym, even with no signal.</T>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
        {error ? <T style={{ color: theme.danger }}>{error}</T> : null}
        {!configured && !devLoginEnabled ? <T variant="small">Sign in is not set up in this build. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.</T> : null}
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
      </Screen>
    </KeyboardAvoidingView>
  );
}
