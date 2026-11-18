import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { newId, saveRows } from "../db";
import type { LocalData } from "../logic/session";
import type { Unit } from "../logic/rows";
import { buildProgramRows, PROGRAMS, type ProgramTemplate } from "../logic/templates";
import { useNotebook } from "../notebook";
import { syncNow } from "../sync";
import { space, useTheme } from "../theme";
import { Button, Card, Sheet, T } from "./ui";

/** Copy a starter program into the user's routines. Returns the names it added. */
export async function copyProgram(db: Parameters<typeof saveRows>[0], data: LocalData, program: ProgramTemplate, unit: Unit) {
  const rows = buildProgramRows(program, data.exercises, data.workouts, newId, unit);
  // Parents first, so the sync outbox sends them before their children.
  await saveRows(db, "workouts", rows.workouts);
  await saveRows(db, "workout_exercises", rows.workoutExercises);
  await saveRows(db, "workout_sets", rows.workoutSets);
  void syncNow();
  return rows;
}

function describe(program: ProgramTemplate) {
  return program.workouts.map((workout) => workout.name).join(", ");
}

export function ProgramPicker({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded?: (names: string[]) => void }) {
  const theme = useTheme();
  const { db, data, unit } = useNotebook();
  const [busy, setBusy] = useState<string | null>(null);

  async function add(program: ProgramTemplate) {
    if (!db || !data) return;
    setBusy(program.id);
    try {
      const rows = await copyProgram(db, data, program, unit);
      const names = rows.workouts.map((row) => row.name);
      onClose();
      Alert.alert(
        `${program.name} added`,
        `${names.join(", ")} ${names.length === 1 ? "is" : "are"} in your workouts. Edit sets, reps and lifts any time.` +
          (rows.skipped ? ` ${rows.skipped} lift${rows.skipped === 1 ? " was" : "s were"} left out until your exercise list updates. Sync while online to get them.` : ""),
      );
      onAdded?.(names);
    } catch (error) {
      Alert.alert("Could not add the program", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Start from a program">
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.md, paddingBottom: 48 }}>
        <T variant="muted">Each program becomes ordinary workouts you own. Weights start blank; log them on your first session and the app remembers.</T>
        {PROGRAMS.map((program) => (
          <Card key={program.id} testID={`program-${program.id}`}>
            <View style={{ gap: 4 }}>
              <T variant="heading">{program.name}</T>
              <T variant="muted">{program.summary}</T>
              <T variant="small" style={{ color: theme.muted }}>
                {describe(program)}
              </T>
            </View>
            <Button label={`Add ${program.workouts.length} workouts`} kind="secondary" busy={busy === program.id} disabled={busy != null} onPress={() => void add(program)} />
          </Card>
        ))}
      </ScrollView>
    </Sheet>
  );
}
