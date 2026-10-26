import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let asked = false;

async function ensurePermission() {
  if (asked) return;
  asked = true;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
  } catch {
    // Rest still counts down on screen without notifications.
  }
}

/** Schedule the "rest done" alert so it fires even with the phone locked. */
export async function startRest(seconds: number): Promise<{ until: number; notificationId: string | null }> {
  const until = Date.now() + seconds * 1000;
  await ensurePermission();
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: { title: "Rest done", body: "Time for your next set." },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(seconds)),
      },
    });
    return { until, notificationId };
  } catch {
    return { until, notificationId: null };
  }
}

export async function cancelRest(notificationId: string | null) {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Already fired.
  }
}
