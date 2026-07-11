import { expect, type Page, test } from "@playwright/test";

// A LabeledInput's error spans live inside the <label>, so its accessible name is not
// stable: locate fields by their exact label span instead of getByLabel.
const field = (page: Page, label: string) =>
  page.locator("label.field").filter({ has: page.getByText(label, { exact: true }) });

// astro.config.mjs falls back `site` to http://localhost:4321, which is exactly the
// preview origin, so under e2e the island considers itself on production (submit
// enabled, no Turnstile key baked, endpoint mocked via page.route). Visiting the same
// server as 127.0.0.1 flips it off-production, covering the gate.

test("contribute: full form submits and shows the PR link (endpoint mocked)", async ({ page }) => {
  await page.route("**/api/add-box", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ prUrl: "https://github.com/blamas/boxdex/pull/999" }),
    });
  });

  await page.goto("/en/contribute");
  await expect(page.getByRole("heading", { name: "Add a Box" })).toBeVisible();

  // Required fields missing: errors listed, submit disabled.
  const submit = page.locator(".submit");
  await expect(submit).toBeDisabled();
  const errorPaths = page.locator(".errors code");
  await expect(errorPaths.filter({ hasText: /^name$/ })).toHaveCount(1);

  await field(page, "Name").locator("input").fill("My E2E Box");
  await expect(errorPaths.filter({ hasText: /^name$/ })).toHaveCount(0);

  await field(page, "Height (mm)").locator("input").fill("730");
  await field(page, "Width (mm)").locator("input").fill("730");
  await field(page, "Depth (mm)").locator("input").fill("650");
  await field(page, "Net volume (L)").locator("input").fill("280");

  // Inline error on the required F3 field clears once a value is entered.
  const f3Field = field(page, "F3 (Hz)");
  await expect(f3Field.locator(".err")).toBeVisible();
  await f3Field.locator("input").fill("38");
  await expect(f3Field.locator(".err")).toHaveCount(0);

  // Driver via the searchable combobox (keyboard: the fixed-position list can sit
  // outside the viewport, selection must not depend on it being visible).
  const driversSection = page.locator("section.card", { hasText: "Drivers" }).first();
  await driversSection.locator(".combobox-trigger").click();
  const search = page.locator(".combobox-search");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(driversSection.locator(".chip-active")).toHaveCount(1);

  await page
    .locator("section.card", { hasText: "License" })
    .locator("select")
    .selectOption("CC0-1.0");

  // All requirements met: the errors card is gone and submit unlocks.
  await expect(page.locator(".errors")).toHaveCount(0);
  await expect(submit).toBeEnabled();

  const [request] = await Promise.all([page.waitForRequest("**/api/add-box"), submit.click()]);
  expect(request.postData()).toContain("My E2E Box");

  await expect(page.locator(".success")).toBeVisible();
  await expect(page.getByRole("link", { name: "View pull request" })).toHaveAttribute(
    "href",
    "https://github.com/blamas/boxdex/pull/999"
  );
});

test("contribute: off the production origin submit stays gated", async ({ page }) => {
  // Same server, different origin string: the island treats 127.0.0.1 as non-prod.
  await page.goto("http://127.0.0.1:4321/en/contribute");
  await expect(page.locator(".notice")).toBeVisible();
  await expect(page.locator(".submit")).toBeDisabled();
});

test("contribute: driver chips remove and re-flag the drivers field", async ({ page }) => {
  await page.goto("/en/contribute");

  const driversSection = page.locator("section.card", { hasText: "Drivers" }).first();
  await driversSection.locator(".combobox-trigger").click();
  const search = page.locator(".combobox-search");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(driversSection.locator(".chip-active")).toHaveCount(1);

  const errorPaths = page.locator(".errors code");
  await expect(errorPaths.filter({ hasText: /^drivers$/ })).toHaveCount(0);

  await driversSection.locator(".chip-x").click();
  await expect(driversSection.locator(".chip-active")).toHaveCount(0);
  await expect(errorPaths.filter({ hasText: /^drivers$/ })).toHaveCount(1);
});

test("contribute: simulation rows add, expose stacked count, and remove", async ({ page }) => {
  await page.goto("/en/contribute");

  const sims = page.locator("section.card", { hasText: "Simulations" }).first();
  await sims.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sims.locator(".row.card")).toHaveCount(1);

  // The stacked-count input only exists for kind spl_stacked.
  const row = sims.locator(".row.card");
  await expect(row.getByLabel("Stacked count")).toHaveCount(0);
  await row.locator("select").first().selectOption("spl_stacked");
  await expect(row.getByLabel("Stacked count")).toBeVisible();

  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(sims.locator(".row.card")).toHaveCount(0);
});

test("contribute: localised French page renders", async ({ page }) => {
  await page.goto("/fr/contribute");
  await expect(page.getByRole("heading", { name: "Ajouter un caisson" })).toBeVisible();
  await expect(page.locator(".submit")).toContainText("Soumettre le caisson");
});
