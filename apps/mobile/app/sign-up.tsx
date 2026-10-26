import { useRouter } from "expo-router";
import { useState } from "react";
import { Button, Field, Screen, T } from "../src/components/ui";
import { useAuth } from "../src/auth";
import { useTheme } from "../src/theme";

export default function SignUp() {
  const theme = useTheme();
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email.");
    if (password.length < 8) return setError("Use at least 8 characters for the password.");
    setBusy(true);
    const result = await signUp(email, password);
    setBusy(false);
    setError(result.error);
    if (!result.error && result.needsConfirmation) setSent(true);
  }

  if (sent) {
    return (
      <Screen edges={["bottom"]}>
        <T variant="heading">Check your email</T>
        <T variant="muted">We sent a link to {email.trim()}. Open it on this phone, then sign in.</T>
        <Button label="Back to sign in" onPress={() => router.replace("/sign-in")} />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <T variant="small">At least 8 characters.</T>
      {error ? <T style={{ color: theme.danger }}>{error}</T> : null}
      <Button label="Create account" onPress={submit} busy={busy} />
    </Screen>
  );
}
