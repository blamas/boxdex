import { expect, test } from "@playwright/test";

test("Pagefind search returns and links to a result", async ({ page }) => {
  await page.goto("/en/");

  const input = page.locator("input.pf-searchbox-input");
  await input.fill("driver");

  // First query pays for WASM instantiation + index fetch, give it room.
  const result = page.locator("a.pf-searchbox-result").first();
  await expect(result).toBeVisible({ timeout: 15_000 });

  const href = await result.getAttribute("href");
  expect(href).toBeTruthy();

  await result.click();
  await expect(page).not.toHaveURL(/\/en\/$/);
});
