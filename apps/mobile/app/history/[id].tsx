import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { Alert, View } from "react-native";
import { Button, Card, Row, Screen, T } from "../../src/components/ui";
import { deleteRow } from "../../src/db";
import { dayAndTime, pair } from "../../src/format";
import { assembleSession } from "../../src/logic/session";
import { useNotebook } from "../../src/notebook";
import { space, useTheme } from "../../src/theme";

export default function SessionDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, data } = useNotebook();
  const view = useMemo(() => (data && id ? assembleSession(data, id) : null), [data, id]);
  if (!view || !db) {
    return (
      <Screen edges={["bottom"]}>
        <T variant="muted">This session is not on this phone.</T>
      </Screen>
    );
  }
  const { session, exercises } = view;
  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: session.name }} />
      <T variant="muted">{dayAndTime(session.started_at)}</T>
      {session.notes ? <T>{session.notes}</T> : null}
      {exercises.map((item) => (
        <Card key={item.id}>
          <T variant="heading">{item.exercise_name}</T>
          {item.sets.map((set, index) => (
            <Row key={set.id} style={{ justifyContent: "space-between", minHeight: 32 }}>
              <T variant={set.kind === "warmup" ? "muted" : "body"}>{set.kind === "warmup" ? "Warmup" : `Set ${index + 1}`}</T>
              <T variant={set.completed_at ? "body" : "muted"}>
                {set.skipped ? "Skipped" : set.completed_at ? `${pair(set.actual_weight, set.actual_unit, set.actual_reps)}${set.rpe ? ` at RPE ${set.rpe}` : ""}` : "Not logged"}
              </T>
            </Row>
          ))}
        </Card>
      ))}
      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Button label={session.status === "in_progress" ? "Resume" : "Edit sets"} kind="secondary" onPress={() => router.push({ pathname: "/session/[id]", params: { id: session.id } })} />
        <Button
          label="Delete session"
          kind="danger"
          onPress={() =>
            Alert.alert("Delete this session?", "It will be removed from your history and charts.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  await deleteRow(db, "sessions", session.id);
                  router.back();
                },
              },
            ])
          }
        />
      </View>
      <T variant="small" style={{ color: theme.muted }}>
        Edits sync to your account the next time you are online.
      </T>
    </Screen>
  );
}
