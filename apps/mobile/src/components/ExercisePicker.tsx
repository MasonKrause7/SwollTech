import { EQUIPMENT, guessExercise, MUSCLES } from "@swolltech/metrics";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { useAuth } from "../auth";
import { newId, openNotebook, saveRow } from "../db";
import type { ExerciseRow } from "../logic/rows";
import { space, useTheme } from "../theme";
import { Button, Chip, Field, Row, Sheet, T } from "./ui";

function label(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function ExercisePicker({
  visible,
  exercises,
  onClose,
  onPick,
}: {
  visible: boolean;
  exercises: ExerciseRow[];
  onClose: () => void;
  onPick: (exercise: ExerciseRow) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  // Creating a custom lift: its name, then muscle and equipment so it counts in the muscle split.
  const [draft, setDraft] = useState<{ name: string; muscle: string; equipment: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const { userId } = useAuth();
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return exercises
      .filter((row) => !row.deleted_at)
      .filter((row) => !needle || row.name.toLowerCase().includes(needle) || row.primary_muscle.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, query]);
  const trimmed = query.trim().toLowerCase();
  const canCreate = trimmed.length > 1 && !exercises.some((row) => !row.deleted_at && row.name.toLowerCase() === trimmed);

  function close() {
    setDraft(null);
    onClose();
  }

  function startDraft() {
    const name = query.trim().slice(0, 80);
    const guess = guessExercise(name);
    setDraft({ name, muscle: guess.muscle ?? "", equipment: guess.equipment ?? "" });
  }

  async function create() {
    if (!draft || !draft.name.trim() || !draft.muscle || !draft.equipment) return;
    setSaving(true);
    try {
      const row: ExerciseRow = { id: newId(), owner_id: userId, name: draft.name.trim(), primary_muscle: draft.muscle, equipment: draft.equipment };
      await saveRow(await openNotebook(), "exercises", row);
      setQuery("");
      setDraft(null);
      onPick(row);
    } finally {
      setSaving(false);
    }
  }

  if (draft) {
    const taken = exercises.some((row) => !row.deleted_at && row.name.trim().toLowerCase() === draft.name.trim().toLowerCase());
    return (
      <Sheet visible={visible} onClose={close} title="New exercise">
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.md, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Field
            label="Name"
            value={draft.name}
            onChangeText={(name) => setDraft({ ...draft, name: name.slice(0, 80) })}
            autoCorrect={false}
            error={taken ? "You already have an exercise with that name" : null}
          />
          <T variant="label">Main muscle</T>
          <T variant="small">Puts its sets in the right bar of your muscle split.</T>
          <Row style={{ flexWrap: "wrap" }}>
            {MUSCLES.map((muscle) => (
              <Chip key={muscle} small label={label(muscle)} selected={draft.muscle === muscle} onPress={() => setDraft({ ...draft, muscle })} testID={`muscle-${muscle}`} />
            ))}
          </Row>
          <T variant="label">Equipment</T>
          <Row style={{ flexWrap: "wrap" }}>
            {EQUIPMENT.map((equipment) => (
              <Chip
                key={equipment}
                small
                label={label(equipment)}
                selected={draft.equipment === equipment}
                onPress={() => setDraft({ ...draft, equipment })}
                testID={`equipment-${equipment}`}
              />
            ))}
          </Row>
          {!draft.muscle || !draft.equipment ? (
            <T variant="small" style={{ color: theme.muted }}>
              Pick a muscle and the equipment to add it.
            </T>
          ) : null}
          <Button
            label={`Add ${draft.name.trim() || "exercise"}`}
            onPress={() => void create()}
            busy={saving}
            disabled={taken || !draft.name.trim() || !draft.muscle || !draft.equipment}
            testID="create-exercise"
          />
          <Button label="Back to search" kind="ghost" onPress={() => setDraft(null)} />
        </ScrollView>
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} title="Add exercise">
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm }}>
        <Field label="Search" value={query} onChangeText={setQuery} placeholder="Bench, squat, back" autoCorrect={false} autoFocus />
        {canCreate ? <Button label={`Add "${query.trim()}" as a new exercise`} kind="secondary" onPress={startDraft} /> : null}
      </View>
      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 60 }}
        ListEmptyComponent={<T variant="muted">No exercises match. Add it as a new one, or sync while online to load the full catalog.</T>}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onPick(item);
              setQuery("");
            }}
            style={({ pressed }) => ({ minHeight: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: theme.line, opacity: pressed ? 0.6 : 1 })}
          >
            <T>{item.name}</T>
            <T variant="small">{[item.primary_muscle, item.equipment].filter(Boolean).join(", ") || "Custom"}</T>
          </Pressable>
        )}
      />
    </Sheet>
  );
}
