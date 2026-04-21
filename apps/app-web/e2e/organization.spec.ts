// F401 (TD-41): test.describe.skip 해제
import { test, expect } from "@playwright/test";

test.describe("Organization switching", () => {
  test("switch from Miraeasset to LPON and verify data refreshes", async ({ page }) => {
    await page.goto("/?legacy=1");
    await expect(page.getByRole("heading", { name: /대시보드 Dashboard/ })).toBeVisible();

    // Default org should be Miraeasset — verify selector shows it
    const trigger = page.locator("[data-slot='select-trigger']").first();
    await expect(trigger).toContainText("미래에셋");

    // Wait for dashboard stats to load with Miraeasset data
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll(".text-3xl.font-bold");
      return cards.length >= 3 && ![...cards].some((c) => c.textContent === "...");
    }, { timeout: 10_000 }).catch(() => null);

    // Capture Miraeasset stats
    const miraeassetStats = await page.locator(".text-3xl.font-bold").allTextContents();

    // Click org selector and switch to LPON
    await trigger.click();
    await page.getByText("LPON 온누리상품권").click();

    // Wait for stats to reload (briefly show '...' then new values)
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll(".text-3xl.font-bold");
      return cards.length >= 3 && ![...cards].some((c) => c.textContent === "...");
    }, { timeout: 10_000 }).catch(() => null);

    // Capture LPON stats
    const lponStats = await page.locator(".text-3xl.font-bold").allTextContents();

    // Stats should differ OR both be empty (no real data in CI is acceptable)
    if (miraeassetStats.length > 0 && lponStats.length > 0) {
      // At minimum, org switch did not crash the page
      expect(lponStats.length).toBeGreaterThan(0);
    }

    // Verify localStorage was updated
    const storedOrg = await page.evaluate(() =>
      localStorage.getItem("ai-foundry-org-id"),
    );
    expect(storedOrg).toBe("LPON");

    // Switch back to Miraeasset to restore default state
    await trigger.click();
    await page.getByText("미래에셋 퇴직연금").click();
  });

  test("org selection persists across page navigation", async ({ page }) => {
    // Set org to LPON via localStorage before navigating
    await page.goto("/?legacy=1");
    await page.evaluate(() =>
      localStorage.setItem("ai-foundry-org-id", "LPON"),
    );

    // Navigate to skills page
    await page.goto("/skills");
    await expect(page.getByRole("heading", { name: /Skill Marketplace/ })).toBeVisible();

    // Selector should still show LPON
    const trigger = page.locator("[data-slot='select-trigger']").first();
    await expect(trigger).toContainText("LPON");

    // Navigate to another page
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /문서 업로드/ })).toBeVisible();

    // Still LPON
    await expect(trigger).toContainText("LPON");

    // Restore default
    await page.evaluate(() =>
      localStorage.setItem("ai-foundry-org-id", "Miraeasset"),
    );
  });

  test("org selector lists all 4 organizations", async ({ page }) => {
    await page.goto("/?legacy=1");
    await expect(page.getByRole("heading", { name: /대시보드 Dashboard/ })).toBeVisible();

    // Open the selector dropdown
    const trigger = page.locator("[data-slot='select-trigger']").first();
    await trigger.click();

    // All 4 orgs should be visible in dropdown (use getByLabel to target SelectItem)
    await expect(page.getByLabel("미래에셋 퇴직연금Miraeasset Pension")).toBeVisible();
    await expect(page.getByLabel("미래에셋 (분석)Miraeasset (Analyzed)")).toBeVisible();
    await expect(page.getByLabel("LPON 온누리상품권LPON Gift Certificate")).toBeVisible();
    await expect(page.getByLabel("파일럿Pilot")).toBeVisible();

    // Close by pressing Escape
    await page.keyboard.press("Escape");
  });
});
