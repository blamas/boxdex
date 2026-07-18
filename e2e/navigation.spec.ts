import { expect, test } from "@playwright/test";

const routes = [
  "/en/find",
  "/en/explore",
  "/en/stack",
  "/en/drivers",
  "/en/horns/compare",
  "/en/compare",
  "/en/drivers/compare",
  "/en/about",
  "/en/help",
  "/en/privacy",
];

for (const route of routes) {
  test(`${route} loads without error`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(route);
    await expect(page.locator("main#main-content")).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("drivers page deep-links the horn tab via ?tab=horn", async ({ page }) => {
  await page.goto("/en/drivers?tab=horn");
  await expect(page.getByRole("button", { name: /horn/i })).toHaveClass(/active/);
});

// Data-agnostic: discover a real enclosure from the catalog rather than hardcoding a
// slug, so regenerating the (synthetic) enclosure data never breaks navigation E2E.
// The specific merged-curve-set tab behaviour is unit-tested in test/curves.test.ts.
test("enclosure detail page loads and renders its curve chart", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/en/find");
  const firstBox = page.locator('a[href*="/enclosures/"]').first();
  await expect(firstBox).toBeVisible();
  await firstBox.click();

  await expect(page).toHaveURL(/\/enclosures\//);
  await expect(page.locator("main#main-content")).toBeVisible();
  // The box's curves island renders a tab group and a chart canvas (no assertion about
  // which specific kinds/counts appear, which depends on the discovered box's data).
  await expect(page.locator(".box-curves .tab-group").first()).toBeVisible();
  await expect(page.locator(".box-curves canvas").first()).toBeVisible();
  expect(errors).toEqual([]);
});

// Horns live under data/drivers/** which this work never touches, but discover one
// anyway so the spec stays independent of any single horn id.
test("horn detail page loads", async ({ page }) => {
  await page.goto("/en/drivers?tab=horn");
  const firstHorn = page.locator('a[href*="/horns/"]').first();
  await expect(firstHorn).toBeVisible();
  await firstHorn.click();
  await expect(page).toHaveURL(/\/horns\//);
  await expect(page.locator("main#main-content")).toBeVisible();
});

test("language switcher navigates en -> fr and preserves the current path", async ({ page }) => {
  await page.goto("/en/find");
  await page.click("#locale-trigger");
  await page.click('[data-locale="fr"]');
  await expect(page).toHaveURL(/\/fr\/find/);
});
