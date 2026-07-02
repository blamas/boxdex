import { expect, test } from "@playwright/test";

test("stack builder: add an enclosure, bump quantity, see amp matching + channel chips", async ({
  page,
}) => {
  await page.goto("/en/stack");

  await page.getByRole("button", { name: "+ sub", exact: true }).click();
  await page.locator(".picker-item").first().click();

  await expect(page.locator(".slot")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Amplifier matching" })).toBeVisible();

  // Channel chips only render once qty > 1.
  await expect(page.locator(".channel-chips")).toHaveCount(0);
  await page.locator(".qty-control button").nth(1).click();
  await expect(page.locator(".qty-input")).toHaveValue("2");
  await expect(page.locator(".channel-chips")).toBeVisible();
});

test("stack builder: removing the only slot restores the empty hint", async ({ page }) => {
  await page.goto("/en/stack");

  await page.getByRole("button", { name: "+ sub", exact: true }).click();
  await page.locator(".picker-item").first().click();
  await expect(page.locator(".slot")).toHaveCount(1);

  await page.locator(".remove-btn").click();
  await expect(page.locator(".slot")).toHaveCount(0);
  await expect(page.locator(".empty-hint")).toBeVisible();
});
