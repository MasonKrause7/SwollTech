import { expect, test } from "@playwright/test";
import { logAllSets, signIn, uniqueEmail, writeWorkout } from "./helpers";

test("plan the month, then start today's workout from Today", async ({ page }) => {
  await signIn(page, uniqueEmail("calendar"));
  await expect(page.getByTestId("plan-hint")).toContainText("Nothing planned");
  await writeWorkout(page, "Push day", "Bench Press", 135);

  await page.goto("/calendar");
  const detail = page.getByTestId("day-detail");
  await expect(detail.getByText("Nothing planned.")).toBeVisible();
  await detail.getByLabel("Workout").selectOption({ label: "Push day" });
  await detail.getByLabel(/^Repeat every/).selectOption({ label: "4 weeks" });
  await detail.getByRole("button", { name: "Add to today" }).click();
  await expect(detail.getByText("Today", { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: /Push day, today/ })).toHaveCount(1);

  await page.goto("/");
  const card = page.getByTestId("today-plan");
  await expect(card).toContainText("Push day");
  await card.getByRole("button", { name: "Start today's workout" }).click();
  await expect(page.getByTestId("focus-exercise")).toHaveText("Bench Press");
  await logAllSets(page, 3);
  await page.getByTestId("finish-session").click();
  await expect(page.getByTestId("summary-headline")).toHaveText("Workout logged.");

  await page.goto("/");
  await expect(page.getByTestId("today-plan")).toHaveCount(0);
  await expect(page.getByTestId("plan-hint")).toContainText("Today's plan is done. Next up: Push day");

  await page.goto("/calendar");
  await expect(page.getByTestId("day-detail").getByText("Done", { exact: true })).toBeVisible();
});
