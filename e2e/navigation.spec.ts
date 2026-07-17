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

test("enclosure detail page loads", async ({ page }) => {
  await page.goto("/en/enclosures/bass-reflex-18/");
  await expect(page.locator("main#main-content")).toBeVisible();
});

test("enclosure curves render kind and stacked-count tabs from one merged curve set", async ({
  page,
}) => {
  // fake-th118's spl+phase+impedance (plus 1x/4x/6x stacked SPL) all live in a single curve-set
  // object per driverProfiles[].simulations entry: assert they render as one merged tab group
  // rather than fragmenting back into separate rows.
  await page.goto("/en/enclosures/fake-th118/");
  // .tab-group order: [0] measurement/simulation toggle, [1] kind tabs, [2] stacked-count tabs
  // (spl is the default active kind, so the count row is already showing).
  const tabGroups = page.locator(".box-curves .controls .tab-group");
  const kindTabs = tabGroups.nth(1);
  await expect(kindTabs.getByRole("button", { name: "SPL (dB)" })).toBeVisible();
  await expect(kindTabs.getByRole("button", { name: "Phase (°)" })).toBeVisible();
  await expect(kindTabs.getByRole("button", { name: "Impedance (Ω)" })).toBeVisible();

  const countTabs = tabGroups.nth(2);
  await expect(countTabs.getByRole("button", { name: "1×" })).toBeVisible();
  await expect(countTabs.getByRole("button", { name: "4×" })).toBeVisible();
  await expect(countTabs.getByRole("button", { name: "6×" })).toBeVisible();
});

test("horn detail page loads", async ({ page }) => {
  await page.goto("/en/horns/bc-me7/");
  await expect(page.locator("main#main-content")).toBeVisible();
});

test("language switcher navigates en -> fr and preserves the current path", async ({ page }) => {
  await page.goto("/en/find");
  await page.click("#locale-trigger");
  await page.click('[data-locale="fr"]');
  await expect(page).toHaveURL(/\/fr\/find/);
});
