import { useEffect, useState } from "react";
import { Alert, Linking } from "react-native";
import { saveProfile } from "../../src/actions";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { webUrl } from "../../src/session";
import { Button, Card, Chip, Field, Row, Screen, SyncPill, T } from "../../src/components/ui";
import { describeSync } from "../../src/logic/status";
import { useNotebook } from "../../src/notebook";
import { countUnsaved, discardFailed, retryFailed, syncBriefly, syncNow, useSyncState } from "../../src/sync";
import { space, useTheme } from "../../src/theme";

export default function Account() {
  const theme = useTheme();
  const { email, signOut } = useAuth();
  const { db, profile, unit } = useNotebook();
  const { state, pending, failed } = useSyncState();
  const [signingOut, setSigningOut] = useState(false);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(profile?.display_name ?? ""), [profile?.display_name]);

  async function saveName() {
    if (!db || !profile || name.trim() === profile.display_name) return;
    await saveProfile(db, profile, { display_name: name.trim().slice(0, 80) });
  }

  /** Signing out wipes this phone. Save what can be saved first, then count what is left, fresh. */
  async function confirmSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    let unsaved = 0;
    try {
      await syncBriefly();
      unsaved = await countUnsaved();
    } catch {
      // If the notebook cannot be read, assume the worst.
      unsaved = Math.max(pending + failed, 1);
    } finally {
      setSigningOut(false);
    }
    if (unsaved > 0) {
      Alert.alert(
        "Unsaved changes",
        `${unsaved} change${unsaved === 1 ? " hasn't" : "s haven't"} been saved to your account yet (sets, sessions or plans). Sign out anyway and lose ${unsaved === 1 ? "it" : "them"}?`,
        [
          { text: "Sync first", style: "cancel", onPress: () => void syncNow() },
          { text: "Sign out and lose them", style: "destructive", onPress: () => void signOut() },
        ],
      );
      return;
    }
    Alert.alert("Sign out?", "Everything on this phone is saved to your account.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  function confirmDiscard() {
    Alert.alert(
      "Discard these changes?",
      `${failed} change${failed === 1 ? "" : "s"} the server refused will stop being retried. What you see on this phone stays as it is, but it won't be in your account.`,
      [
        { text: "Keep", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => void discardFailed() },
      ],
    );
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
          {describeSync(state, pending).tone === "ok" && failed === 0
            ? "Everything on this phone is saved to your account."
            : "Sets you log are kept on this phone and sent to your account when you have signal."}
        </T>
        <Button label="Sync now" kind="secondary" onPress={() => void syncNow()} busy={state.kind === "syncing"} />
        {failed > 0 ? (
          <>
            <T variant="small" style={{ color: theme.danger, marginTop: space.sm }}>
              {`${failed} change${failed === 1 ? "" : "s"} couldn't be saved to your account. They are kept on this phone.`}
            </T>
            <Row>
              <Button label="Try again" kind="secondary" style={{ flex: 1 }} onPress={() => void retryFailed()} />
              <Button label="Discard" kind="danger" style={{ flex: 1 }} onPress={confirmDiscard} />
            </Row>
          </>
        ) : null}
      </Card>

      <Card>
        <T variant="heading">Help and legal</T>
        <Button label="Privacy Policy" kind="secondary" onPress={() => void Linking.openURL(`${webUrl}/privacy`)} />
        <Button label="Terms of Use" kind="secondary" onPress={() => void Linking.openURL(`${webUrl}/terms`)} />
        <Button label="Support" kind="secondary" onPress={() => void Linking.openURL(`${webUrl}/support`)} />
        <T variant="small">Questions? support@everydaytechllc.com</T>
      </Card>

      <Button label="Sign out" kind="secondary" onPress={() => void confirmSignOut()} busy={signingOut} />

      <Card style={{ borderColor: theme.danger }}>
        <T variant="heading">Delete account</T>
        <T variant="muted">This permanently removes your login, workouts, sessions and videos from SwollTech. It cannot be undone.</T>
        <Field label="Type DELETE to confirm" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" error={error} />
        <Button label="Delete account" kind="danger" onPress={() => void deleteAccount()} busy={deleting} disabled={confirm !== "DELETE"} />
      </Card>
    </Screen>
  );
}
