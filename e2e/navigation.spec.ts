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
