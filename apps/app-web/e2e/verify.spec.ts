// TODO(S224/TD-41): protected route — CF Access mock 후 재활성화.
import { test, expect } from "@playwright/test";

test.describe.skip("Verify group", () => {
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

});
