import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Routes worth an automated pass: one of each page shape, including every island that
// renders a chart (charts are the primary content here and render to canvas).
const routes = [
  "/en/",
  "/en/find",
  "/en/explore",
  "/en/compare",
  "/en/stack",
  "/en/drivers",
  "/en/drivers/compare",
  "/en/horns/compare",
  "/en/help",
  "/en/about",
];

// WCAG 2.1 A + AA only. Best-practice rules are deliberately excluded: they flag
// stylistic preferences that would make this gate noisy rather than actionable.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

for (const route of routes) {
  test(`${route} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(route);
    // Islands are client:only, so the static shell paints before any of them exist.
    // Wait for real content, otherwise axe scans an empty page and always passes.
    await expect(page.locator("main#main-content")).toBeVisible();
    await page.waitForLoadState("networkidle");

    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

    expect(violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))).toEqual(
      []
    );
  });
}

test("every rendered chart exposes an accessible name", async ({ page }) => {
  // Regression guard for EChart.svelte: the host div carries role="figure" plus a
  // caller-supplied aria-label. Without it a chart is an empty box to a screen reader.
  await page.goto("/en/explore");
  await expect(page.locator("main#main-content")).toBeVisible();
  await page.waitForLoadState("networkidle");

  const figures = page.getByRole("figure");
  await expect(figures.first()).toBeVisible();

  for (const figure of await figures.all()) {
    const label = await figure.getAttribute("aria-label");
    expect(label?.trim()).toBeTruthy();
  }
});
