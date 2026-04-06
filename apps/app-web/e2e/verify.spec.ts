import { test, expect } from "@playwright/test";

test.describe("Verify group", () => {
  test("HITL review page renders", async ({ page }) => {
    await page.goto("/hitl");
    await expect(page.getByRole("heading", { name: /HITL 검토/ })).toBeVisible();
  });

  test("fact check page renders", async ({ page }) => {
    await page.goto("/fact-check");
    await expect(page.getByRole("heading", { name: /Fact Check Dashboard/ })).toBeVisible();
  });

  test("gap analysis page renders", async ({ page }) => {
    await page.goto("/gap-analysis");
    await expect(page.getByRole("heading", { name: /Gap 분석/ })).toBeVisible();
  });

  test("trust dashboard page renders", async ({ page }) => {
    await page.goto("/trust");
    await expect(page.getByRole("heading", { name: /신뢰도/ })).toBeVisible();
  });
});
