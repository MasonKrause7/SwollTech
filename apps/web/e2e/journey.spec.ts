import { expect, test } from "@playwright/test";
import { logAllSets, signIn, uniqueEmail, writeWorkout } from "./helpers";

test("plan a workout, follow it set by set, and see a record the next time", async ({ page }) => {
  await signIn(page, uniqueEmail("journey"));
  await writeWorkout(page, "Push day", "Bench Press", 135);

  await page.getByTestId("start-workout").click();
  await expect(page.getByTestId("focus-exercise")).toHaveText("Bench Press");
  await expect(page.getByTestId("focus-set")).toHaveText("Set 1 of 3");
  await expect(page.getByLabel("Weight", { exact: true })).toHaveValue("135");
  await expect(page.getByRole("figure")).toContainText("Each side: 45 lb.");
  await expect(page.getByTestId("previous-sets")).toContainText("first time");

  await logAllSets(page, 3);
  await expect(page.getByText("Every set is logged")).toBeVisible();
  await page.getByTestId("finish-session").click();
  await expect(page.getByTestId("summary-headline")).toHaveText("Workout logged.");
  await expect(page.getByText("135 lb × 5")).toBeVisible();

  await page.getByRole("link", { name: "Done" }).click();
  await page.getByTestId("start-Push day").click();
  await expect(page.getByTestId("previous-sets")).toContainText("135 lb × 5");
  await page.getByLabel("Weight", { exact: true }).fill("145");
  await logAllSets(page, 1);
  await expect(page.getByTestId("focus-set")).toHaveText("Set 2 of 3");
  await page.getByTestId("finish-session").click();
  await page.getByTestId("confirm").click();
  await expect(page.getByTestId("summary-headline")).toHaveText("1 new record.");
  await expect(page.getByTestId("record")).toContainText("Bench Press");

  await page.goto("/progress");
  await expect(page.getByText("personal records")).toBeVisible();
  await page.getByTestId("lift-Bench Press").click();
  await expect(page.getByTestId("progress-chart")).toBeVisible();
  await expect(page.getByRole("region", { name: "Summary" })).toContainText(/2\s*sessions/);
});

test("one lifter never sees another lifter's workouts", async ({ page, browser }) => {
  await signIn(page, uniqueEmail("owner"));
  await writeWorkout(page, "Secret program", "Back Squat", 225);

  const other = await browser.newPage();
  await signIn(other, uniqueEmail("other"));
  await other.goto("/workouts");
  await expect(other.getByText("No workouts yet")).toBeVisible();
  await other.goto(page.url());
  await expect(other.getByRole("alert")).toContainText("Not found");
  await other.close();
});

test("switching to kilograms changes how totals read", async ({ page }) => {
  await signIn(page, uniqueEmail("units"));
  await writeWorkout(page, "Squat day", "Back Squat", 225);
  await page.getByTestId("start-workout").click();
  await logAllSets(page, 3);
  await page.getByTestId("finish-session").click();
  await expect(page.getByText("3,375")).toBeVisible();

  await page.goto("/account");
  await page.getByTestId("unit-kg").click();
  await expect(page.getByRole("status")).toContainText("kilograms");
  await page.goto("/progress");
  await expect(page.getByText("1,531")).toBeVisible();
});

test("signing out returns to sign in and protects pages", async ({ page }) => {
  await signIn(page, uniqueEmail("signout"));
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await page.goto("/history");
  await expect(page).toHaveURL(/\/signin$/);
});

test("logging works from a phone @phone", async ({ page }) => {
  await signIn(page, uniqueEmail("phone"));
  await page.getByRole("button", { name: "Empty workout" }).click();
  await page.getByTestId("add-session-exercise").click();
  await page.getByTestId("exercise-search").fill("dead");
  await page.getByTestId("add-Deadlift").click();
  await expect(page.getByTestId("focus-exercise")).toHaveText("Deadlift");
  await page.getByLabel("Weight", { exact: true }).fill("315");
  await page.getByLabel("Reps", { exact: true }).fill("3");
  await expect(page.getByRole("figure")).toContainText("45 + 45 + 45");
  await page.getByRole("button", { name: /Log set/ }).click();
  await expect(page.getByTestId("rest-timer")).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).last().getByRole("link", { name: "History" }).click();
  await expect(page.getByText("In progress")).toBeVisible();
});
