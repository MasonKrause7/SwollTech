import { useState } from "react";
import { Button, Field, Screen, T } from "../src/components/ui";
import { useAuth } from "../src/auth";
import { useTheme } from "../src/theme";

export default function Reset() {
  const theme = useTheme();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim()) return setError("Enter the email you signed up with.");
    setBusy(true);
    const problem = await resetPassword(email);
    setBusy(false);
    setError(problem);
    setSent(!problem);
  }

  return (
    <Screen edges={["bottom"]}>
      <T variant="muted">We will email you a link to set a new password.</T>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      {error ? <T style={{ color: theme.danger }}>{error}</T> : null}
      {sent ? <T>Reset link sent. Check your inbox.</T> : null}
      <Button label="Send reset link" onPress={submit} busy={busy} />
    </Screen>
  );
}
