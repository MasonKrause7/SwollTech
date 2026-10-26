import { expect, type Page } from "@playwright/test";

export function uniqueEmail(tag: string) {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

export async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.getByTestId("email").fill(email);
  await page.getByTestId("dev-login").click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Morning|Afternoon|Evening/);
}

/** Writes a workout with one exercise and three planned sets at the given weight. */
export async function writeWorkout(page: Page, name: string, exercise: string, weight: number) {
  await page.goto("/workouts/new");
  await page.getByTestId("workout-name").fill(name);
  await page.getByTestId("save-workout").click();
  await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]{36}$/);
  await page.getByTestId("exercise-search").fill(exercise.split(" ")[0]);
  await page.getByTestId(`add-${exercise}`).click();
  const weights = page.getByTestId("plan-weight");
  await expect(page.getByTestId("plan-reps")).toHaveCount(3);
  const loads = page.getByRole("combobox").filter({ hasText: "% of max" });
  for (let index = 0; index < 3; index += 1) {
    await loads.nth(index).selectOption("weight");
    await weights.nth(index).fill(String(weight));
    await weights.nth(index).blur();
  }
  await expect(page.getByTestId("plan-weight").first()).toHaveValue(String(weight));
}

/** Logs every open set with the prefilled numbers, skipping rest. */
export async function logAllSets(page: Page, count: number, reps?: number) {
  for (let index = 0; index < count; index += 1) {
    const focus = page.getByRole("form", { name: "Current set" });
    await expect(focus).toBeVisible();
    if (reps != null) await focus.getByLabel("Reps", { exact: true }).fill(String(reps));
    await focus.getByRole("button", { name: /Log set/ }).click();
    const rest = page.getByTestId("rest-timer");
    await expect(rest).toBeVisible();
    await rest.getByRole("button", { name: "Skip rest" }).click();
  }
}
