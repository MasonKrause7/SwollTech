import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { saveProfile } from "../../src/actions";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { Button, Card, Chip, Field, Row, Screen, SyncPill, T } from "../../src/components/ui";
import { describeSync } from "../../src/logic/status";
import { useNotebook } from "../../src/notebook";
import { syncNow, useSyncState } from "../../src/sync";
import { space, useTheme } from "../../src/theme";

export default function Account() {
  const theme = useTheme();
  const { email, signOut } = useAuth();
  const { db, profile, unit } = useNotebook();
  const { state, pending } = useSyncState();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(profile?.display_name ?? ""), [profile?.display_name]);

  async function saveName() {
    if (!db || !profile || name.trim() === profile.display_name) return;
    await saveProfile(db, profile, { display_name: name.trim().slice(0, 80) });
  }

  function confirmSignOut() {
    const message = pending > 0 ? `${pending} change${pending === 1 ? " has" : "s have"} not synced yet and will be lost.` : "Your data stays in your account.";
    Alert.alert("Sign out?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  async function deleteAccount() {
    if (confirm !== "DELETE") return setError("Type DELETE to confirm.");
    setDeleting(true);
    setError(null);
    try {
      await api().deleteMe();
      await signOut();
    } catch (problem) {
      setError(problem instanceof Error ? `Could not delete the account: ${problem.message}` : "Could not delete the account. Check your connection.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Screen>
      <T variant="title">Account</T>
      {email ? <T variant="muted">{email}</T> : null}

      <Card>
        <Field label="Display name" value={name} onChangeText={setName} onEndEditing={() => void saveName()} />
        <T variant="label" style={{ marginTop: space.sm }}>
          Units
        </T>
        <Row>
          <Chip label="lb" selected={unit === "lb"} onPress={() => db && profile && void saveProfile(db, profile, { unit_preference: "lb" })} />
          <Chip label="kg" selected={unit === "kg"} onPress={() => db && profile && void saveProfile(db, profile, { unit_preference: "kg" })} />
        </Row>
        {!profile ? <T variant="small">Sync once to load your profile.</T> : null}
      </Card>

      <Card>
        <T variant="heading">Sync</T>
        <SyncPill onPress={() => void syncNow()} />
        <T variant="small">
          {describeSync(state, pending).tone === "ok"
            ? "Everything on this phone is saved to your account."
            : "Sets you log are kept on this phone and sent to your account when you have signal."}
        </T>
        <Button label="Sync now" kind="secondary" onPress={() => void syncNow()} busy={state.kind === "syncing"} />
      </Card>

      <Button label="Sign out" kind="secondary" onPress={confirmSignOut} />

      <Card style={{ borderColor: theme.danger }}>
        <T variant="heading">Delete account</T>
        <T variant="muted">This permanently removes your workouts, sessions and videos from SwollTech. It cannot be undone.</T>
        <Field label="Type DELETE to confirm" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" error={error} />
        <Button label="Delete account" kind="danger" onPress={() => void deleteAccount()} busy={deleting} disabled={confirm !== "DELETE"} />
      </Card>
    </Screen>
  );
}
