import { deviceTimeZone, localDay, monthGrid, shiftMonth, type PlanState } from "@swolltech/metrics";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { movePlan, removePlan, scheduleWorkout, startWorkout } from "../../src/actions";
import { Button, Card, Chip, Empty, Row, Screen, Sheet, T } from "../../src/components/ui";
import { dayTitle } from "../../src/format";
import { live, type ScheduledWorkoutRow } from "../../src/logic/rows";
import { planViews, type PlanView } from "../../src/logic/schedule";
import { useNotebook } from "../../src/notebook";
import { syncNow, useSyncState } from "../../src/sync";
import { fonts, radius, space, useTheme, type Palette } from "../../src/theme";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const REPEATS = [
  { weeks: 0, label: "Once" },
  { weeks: 1, label: "2 wk" },
  { weeks: 3, label: "4 wk" },
  { weeks: 7, label: "8 wk" },
  { weeks: 11, label: "12 wk" },
];
const STATE_LABEL: Record<PlanState, string> = { done: "Done", in_progress: "In progress", today: "Today", missed: "Missed", upcoming: "Planned" };

function monthTitle(month: string) {
  return new Date(`${month}-15T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function dotColor(state: PlanState, theme: Palette) {
  if (state === "today" || state === "in_progress") return theme.highlight;
  if (state === "done") return theme.text;
  if (state === "missed") return "transparent";
  return theme.muted;
}

function MonthGrid({
  month,
  onMonth,
  selected,
  onSelect,
  today,
  states,
}: {
  month: string;
  onMonth: (month: string) => void;
  selected: string;
  onSelect: (day: string) => void;
  today: string;
  states: Map<string, PlanState[]>;
}) {
  const theme = useTheme();
  const weeks = useMemo(() => monthGrid(month), [month]);
  const arrow = (direction: -1 | 1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction < 0 ? "Previous month" : "Next month"}
      onPress={() => onMonth(shiftMonth(month, direction))}
      hitSlop={8}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? theme.track : "transparent" })}
    >
      <Text style={{ color: theme.text, fontFamily: fonts.display, fontSize: 26 }}>{direction < 0 ? "‹" : "›"}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: space.sm }}>
      <Row style={{ justifyContent: "space-between" }}>
        {arrow(-1)}
        <T variant="heading">{monthTitle(month)}</T>
        {arrow(1)}
      </Row>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((name, index) => (
          <T key={index} variant="small" style={{ flex: 1, textAlign: "center" }}>
            {name}
          </T>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={{ flexDirection: "row" }}>
          {week.map((day) => {
            const isSelected = day === selected;
            const isToday = day === today;
            const outside = day.slice(0, 7) !== month;
            const dayStates = states.get(day) ?? [];
            return (
              <Pressable
                key={day}
                testID={`day-${day}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${dayTitle(day)}${dayStates.length ? `, ${dayStates.length} planned` : ""}`}
                onPress={() => onSelect(day)}
                style={{ flex: 1, alignItems: "center", paddingVertical: 4, minHeight: 52, opacity: outside ? 0.4 : 1 }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isToday ? theme.highlight : "transparent",
                    borderWidth: isSelected ? 2 : 0,
                    borderColor: theme.text,
                  }}
                >
                  <Text style={{ color: isToday ? theme.highlightInk : theme.text, fontFamily: fonts.displaySemi, fontSize: 18, fontVariant: ["tabular-nums"] }}>{Number(day.slice(8))}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 3, height: 8, marginTop: 3 }}>
                  {dayStates.slice(0, 3).map((state, index) => (
                    <View
                      key={index}
                      style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor(state, theme), borderWidth: state === "missed" ? 1 : 0, borderColor: theme.muted }}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function Calendar() {
  const theme = useTheme();
  const router = useRouter();
  const { db, data, unit } = useNotebook();
  const { state } = useSyncState();
  const zone = deviceTimeZone();
  const today = localDay(new Date(), zone);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<ScheduledWorkoutRow | null>(null);
  const [moveMonth, setMoveMonth] = useState(today.slice(0, 7));
  const [choice, setChoice] = useState<string | null>(null);
  const [repeat, setRepeat] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const views = useMemo(() => (data ? planViews(data, today, zone) : []), [data, today, zone]);
  const statesByDay = useMemo(() => {
    const map = new Map<string, PlanState[]>();
    for (const view of views) map.set(view.plan.scheduled_on, [...(map.get(view.plan.scheduled_on) ?? []), view.status.state]);
    return map;
  }, [views]);
  const workouts = useMemo(() => live(data?.workouts ?? []).filter((row) => !row.archived_at).sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const dayViews = views.filter((view) => view.plan.scheduled_on === selected);

  function select(day: string) {
    setSelected(day);
    if (day.slice(0, 7) !== month) setMonth(day.slice(0, 7));
  }

  function openAdd() {
    setChoice(workouts[0]?.id ?? null);
    setRepeat(0);
    setAdding(true);
  }

  async function add() {
    if (!db || !choice) return;
    setBusy("add");
    try {
      await scheduleWorkout(db, choice, selected, repeat);
      setAdding(false);
    } finally {
      setBusy(null);
    }
  }

  async function start(view: PlanView) {
    if (!db) return;
    setBusy(view.plan.id);
    try {
      const id = await startWorkout(db, view.workout.id, unit);
      router.push({ pathname: "/session/[id]", params: { id } });
    } catch (error) {
      Alert.alert("Could not start", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(null);
    }
  }

  function confirmRemove(view: PlanView) {
    Alert.alert(`Remove ${view.workout.name}?`, `It comes off ${dayTitle(view.plan.scheduled_on)}. The workout itself stays.`, [
      { text: "Keep", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => db && void removePlan(db, view.plan.id) },
    ]);
  }

  return (
    <Screen refreshing={state.kind === "syncing"} onRefresh={() => void syncNow()}>
      <Row style={{ justifyContent: "space-between" }}>
        <T variant="title">Calendar</T>
        {selected !== today || month !== today.slice(0, 7) ? <Button label="Today" kind="ghost" compact onPress={() => select(today)} /> : null}
      </Row>

      <Card style={{ paddingHorizontal: space.sm }}>
        <MonthGrid month={month} onMonth={setMonth} selected={selected} onSelect={select} today={today} states={statesByDay} />
      </Card>

      <Row style={{ justifyContent: "space-between", marginTop: space.sm }}>
        <T variant="heading" style={{ flex: 1 }}>
          {selected === today ? "Today" : dayTitle(selected)}
        </T>
        {workouts.length ? <Button label="Plan" compact onPress={openAdd} testID="plan-workout" style={{ minWidth: 80, minHeight: 44 }} /> : null}
      </Row>

      {workouts.length === 0 ? (
        <Empty title="No workouts to plan" body="Write a workout first, then put it on the days you want to train." action={<Button label="Write a workout" onPress={() => router.push({ pathname: "/workout/[id]", params: { id: "new" } })} />} />
      ) : dayViews.length === 0 ? (
        <T variant="muted">Nothing planned. Tap Plan to add a workout{selected < today ? "" : ", and repeat it weekly to fill out the month"}.</T>
      ) : null}

      {dayViews.map((view) => (
        <Card key={view.plan.id} style={view.status.state === "today" ? { borderColor: theme.highlight, borderWidth: 2 } : undefined}>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="heading">{view.workout.name}</T>
              <T variant="small" style={view.status.state === "today" || view.status.state === "in_progress" ? { color: theme.highlight } : undefined}>
                {STATE_LABEL[view.status.state]}
                {view.workout.archived_at ? ". Workout archived" : ""}
              </T>
            </View>
            {view.status.state === "today" && !view.workout.archived_at ? (
              <Button label="Start" compact busy={busy === view.plan.id} onPress={() => void start(view)} style={{ minWidth: 92, minHeight: 48 }} />
            ) : null}
            {view.status.sessionId ? (
              <Button
                label={view.status.state === "done" ? "View" : "Resume"}
                kind="secondary"
                compact
                onPress={() =>
                  view.status.state === "done"
                    ? router.push({ pathname: "/history/[id]", params: { id: view.status.sessionId! } })
                    : router.push({ pathname: "/session/[id]", params: { id: view.status.sessionId! } })
                }
              />
            ) : null}
          </Row>
          {!view.status.sessionId ? (
            <Row gap={space.sm}>
              <Button
                label="Move"
                kind="secondary"
                compact
                onPress={() => {
                  setMoveMonth(view.plan.scheduled_on.slice(0, 7));
                  setMoving(view.plan);
                }}
                style={{ flex: 1 }}
              />
              <Button label="Remove" kind="ghost" compact onPress={() => confirmRemove(view)} style={{ flex: 1 }} />
            </Row>
          ) : null}
        </Card>
      ))}

      <Sheet visible={adding} onClose={() => setAdding(false)} title={`Plan ${selected === today ? "today" : dayTitle(selected)}`}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
          <T variant="label">Workout</T>
          {workouts.map((workout) => (
            <Card key={workout.id} onPress={() => setChoice(workout.id)} style={choice === workout.id ? { borderColor: theme.accent, borderWidth: 2 } : undefined} testID={`choose-${workout.name}`}>
              <T variant="body">{workout.name}</T>
            </Card>
          ))}
          <T variant="label" style={{ marginTop: space.sm }}>
            Repeat every {new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" })}
          </T>
          <Row gap={space.sm} style={{ flexWrap: "wrap" }}>
            {REPEATS.map((option) => (
              <Chip key={option.weeks} label={option.label} selected={repeat === option.weeks} onPress={() => setRepeat(option.weeks)} />
            ))}
          </Row>
          <Button label={repeat ? `Plan ${repeat + 1} weeks` : "Plan it"} onPress={() => void add()} busy={busy === "add"} disabled={!choice} testID="save-plan" style={{ marginTop: space.md }} />
        </ScrollView>
      </Sheet>

      <Sheet visible={moving != null} onClose={() => setMoving(null)} title="Move to">
        <View style={{ padding: space.lg }}>
          <MonthGrid
            month={moveMonth}
            onMonth={setMoveMonth}
            selected={moving?.scheduled_on ?? today}
            today={today}
            states={statesByDay}
            onSelect={(day) => {
              const plan = moving;
              setMoving(null);
              if (db && plan && day !== plan.scheduled_on) {
                void movePlan(db, plan, day);
                select(day);
              }
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
