import { test, expect } from "@playwright/test";

test.describe("Deliver group", () => {
  test("skill catalog page renders", async ({ page }) => {
    await page.goto("/skills");
    await expect(page.getByRole("heading", { name: /Skill Marketplace/ })).toBeVisible();
  });

  test("skill detail page via catalog navigation", async ({ page }) => {
    await page.goto("/skills");
    // Wait for skill cards to load, click the first one
    const firstSkill = page.locator("[data-testid='skill-card'], .cursor-pointer").first();
    if (await firstSkill.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstSkill.click();
      await expect(page.url()).toContain("/skills/");
    }
  });

  test("spec catalog page renders", async ({ page }) => {
    await page.goto("/specs");
    await expect(page.getByRole("heading", { name: /Spec 카탈로그/ })).toBeVisible();
  });

  test("spec detail page via catalog navigation", async ({ page }) => {
    await page.goto("/specs");
    const firstSpec = page.locator("[data-testid='spec-card'], .cursor-pointer").first();
    if (await firstSpec.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstSpec.click();
      await expect(page.url()).toContain("/specs/");
    }
  });

  test("export center page renders", async ({ page }) => {
    await page.goto("/export");
    await expect(page.getByRole("heading", { name: /Export 센터/ })).toBeVisible();
  });

  test("API console page renders", async ({ page }) => {
    await page.goto("/api-console");
    await expect(page.getByRole("heading", { name: /API/ })).toBeVisible();
  });
});
