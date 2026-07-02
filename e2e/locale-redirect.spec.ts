import { expect, test } from "@playwright/test";

test.describe("root locale redirect", () => {
  test("defaults to /en/ for an unmatched locale", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en\/$/);
  });

  test("redirects to /fr/ when the browser locale is French", async ({ browser }) => {
    const context = await browser.newContext({ locale: "fr-FR" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/fr\/$/);
    await context.close();
  });
});
