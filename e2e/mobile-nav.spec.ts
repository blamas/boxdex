import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 375, height: 800 } });

test("hamburger toggles the nav-open class and aria-expanded", async ({ page }) => {
  await page.goto("/en/find");
  const toggle = page.locator("#nav-toggle");
  const nav = page.locator("nav");

  await expect(toggle).toBeVisible();
  await expect(nav).not.toHaveClass(/nav-open/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(nav).toHaveClass(/nav-open/);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("navigating closes the open nav (astro:page-load listener)", async ({ page }) => {
  await page.goto("/en/find");
  await page.locator("#nav-toggle").click();
  await expect(page.locator("nav")).toHaveClass(/nav-open/);

  await page.locator(".nav-links a", { hasText: "Explore" }).click();
  await expect(page).toHaveURL(/\/en\/explore/);
  await expect(page.locator("nav")).not.toHaveClass(/nav-open/);
  await expect(page.locator("#nav-toggle")).toHaveAttribute("aria-expanded", "false");
});
