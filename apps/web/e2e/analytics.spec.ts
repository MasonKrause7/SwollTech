import { expect, test, type Page } from "@playwright/test";
import { logAllSets, signIn, uniqueEmail, writeWorkout } from "./helpers";

async function trainAndFinish(page: Page, weight: number) {
  await page.goto("/");
  await page.getByTestId("start-Push day").click();
  await expect(page.getByTestId("focus-exercise")).toHaveText("Bench Press");
  await page.getByLabel("Weight", { exact: true }).fill(String(weight));
  await logAllSets(page, 3);
  await page.getByTestId("finish-session").click();
  await expect(page.getByTestId("summary-headline")).toBeVisible();
}

test("analyze a lift across sessions, then slice it by frequency", async ({ page }) => {
  await signIn(page, uniqueEmail("analyze"));
  await writeWorkout(page, "Push day", "Bench Press", 100);
  await trainAndFinish(page, 100);
  await trainAndFinish(page, 110);

  // A workout that is started and then discarded never reaches the charts.
  await page.goto("/");
  await page.getByTestId("start-Push day").click();
  await page.getByLabel("Weight", { exact: true }).fill("400");
  await logAllSets(page, 1);
  await page.getByRole("button", { name: "Discard" }).click();
  await page.getByTestId("confirm").click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/progress");
  const panel = page.getByTestId("analyze");
  await expect(panel.getByRole("heading", { name: "Analyze" })).toBeVisible();
  const lift = panel.getByRole("combobox", { name: "Lift" });
  await expect(lift).toHaveValue(/[0-9a-f-]{36}/);
  await expect(lift.locator("option:checked")).toHaveText("Bench Press (2)");

  // Top weight per session: 100 then 110, a 10% climb.
  await panel.getByRole("button", { name: "Top weight" }).click();
  await panel.getByRole("button", { name: "Session" }).click();
  await expect(panel.getByRole("img", { name: /Top weight of Bench Press by session/ })).toBeVisible();
  const figures = panel.getByLabel("Summary for this chart");
  await expect(figures).toContainText("110 lb");
  await expect(figures).toContainText("+10%");

  // Every chart type renders the same data.
  for (const type of ["Bar", "Area", "Line"]) {
    await panel.getByRole("button", { name: type }).click();
    await expect(panel.getByRole("button", { name: type })).toHaveAttribute("aria-pressed", "true");
    await expect(panel.locator(".chart-box > .recharts-responsive-container .recharts-wrapper > svg.recharts-surface")).toBeVisible();
  }

  // All lifts together: maxes make no sense, frequency does. The discarded workout is not counted.
  await lift.selectOption({ label: "All lifts (2)" });
  await expect(panel.getByRole("button", { name: "Estimated max" })).toBeDisabled();
  await panel.getByRole("button", { name: "Frequency" }).click();
  await panel.getByRole("button", { name: "All" }).click();
  await expect(figures.locator("div").first()).toContainText("2");
  await expect(figures.locator("div").first()).toContainText("total");

  // Volume never includes the 400 lb set from the discarded session. The 110 only applied to
  // the first set of session two; the rest kept the planned 100: 1,500 + 550 + 500 + 500.
  await panel.getByRole("button", { name: "Volume" }).click();
  await expect(figures.locator("div").first()).toContainText("3,050 lb");
});

test("analytics follow the unit preference", async ({ page }) => {
  await signIn(page, uniqueEmail("analyze-kg"));
  await writeWorkout(page, "Push day", "Bench Press", 225);
  await trainAndFinish(page, 225);
  await page.goto("/account");
  await page.getByTestId("unit-kg").click();
  await expect(page.getByRole("status")).toContainText("kilograms");

  await page.goto("/progress");
  const panel = page.getByTestId("analyze");
  await panel.getByRole("button", { name: "Top weight" }).click();
  await panel.getByRole("button", { name: "Session" }).click();
  await expect(panel.getByLabel("Summary for this chart")).toContainText("102 kg");
});
