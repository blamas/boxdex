import { expect, type Page, test } from "@playwright/test";

// These pages are the ones that actually render an ECharts canvas
// (CurveChart / RadarCompare). A dependency bump can leave the DOM intact
// while breaking the chart draw silently, so assert the canvas has real
// pixel dimensions, not just that the wrapper markup is present.
async function expectRenderedCanvas(page: Page, scope: string) {
  const canvas = page.locator(`${scope} canvas`).first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
}

async function addFirstAvailable(page: Page) {
  const scope = page.locator(".combobox-wrap");
  await scope.locator(".combobox-trigger").click();
  await scope.locator(".combobox-item").first().click();
}

test("compare page renders a curve chart after selecting an enclosure", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/en/compare");
  await page.locator('tbody input[type="checkbox"]').first().check();

  await expectRenderedCanvas(page, ".compare");
  expect(errors).toEqual([]);
});

test("drivers compare page renders a radar chart after selecting two drivers", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/en/drivers/compare");
  await addFirstAvailable(page);
  await addFirstAvailable(page);

  await expectRenderedCanvas(page, ".radar-wrap");
  expect(errors).toEqual([]);
});

test("horns compare page renders a radar chart after selecting two horns", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/en/horns/compare");
  await addFirstAvailable(page);
  await addFirstAvailable(page);

  await expectRenderedCanvas(page, ".radar-wrap");
  expect(errors).toEqual([]);
});
