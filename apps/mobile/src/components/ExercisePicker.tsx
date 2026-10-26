import { useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useAuth } from "../auth";
import { newId, openNotebook, saveRow } from "../db";
import type { ExerciseRow } from "../logic/rows";
import { space, useTheme } from "../theme";
import { Button, Field, Sheet, T } from "./ui";

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
  return (
    <Sheet visible={visible} onClose={onClose} title="Add exercise">
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm }}>
        <Field label="Search" value={query} onChangeText={setQuery} placeholder="Bench, squat, back" autoCorrect={false} autoFocus />
        {canCreate ? (
          <Button
            label={`Add "${query.trim()}" as a new exercise`}
            kind="secondary"
            onPress={async () => {
              const row: ExerciseRow = { id: newId(), owner_id: userId, name: query.trim().slice(0, 80), primary_muscle: "", equipment: "" };
              await saveRow(await openNotebook(), "exercises", row);
              setQuery("");
              onPick(row);
            }}
          />
        ) : null}
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
