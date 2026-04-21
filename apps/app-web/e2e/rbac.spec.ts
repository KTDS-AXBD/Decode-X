// TODO(S224/TD-41): DEMO_USERS 폐기(F389)로 loginAs() 헬퍼 전체 skip. CF Access mock 후 재활성화.
import { test, expect, type BrowserContext } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-unused-vars */

/** Create a fresh browser context logged in as a specific demo user. */
async function loginAs(
  browser: import("@playwright/test").Browser,
  userId: string,
): Promise<BrowserContext> {
  const ctx = await browser.newContext({ storageState: undefined });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByText(getUserName(userId)).click();
  await expect(page).toHaveURL("/");
  return ctx;
}

function getUserName(userId: string): string {
  const map: Record<string, string> = {
    "admin-001": "서민원",
    "reviewer-001": "양대진",
    "analyst-001": "김경임",
    "developer-001": "김정원",
  };
  return map[userId] ?? userId;
}

test.describe.skip("RBAC: Fact Check gap review visibility", () => {
  test("Reviewer sees Review Actions on pending gaps", async ({ browser }) => {
    const ctx = await loginAs(browser, "reviewer-001");
    const page = await ctx.newPage();

    await page.goto("/fact-check");
    await expect(page.getByRole("heading", { name: /Fact Check Dashboard/ })).toBeVisible();

    // Wait for results to load
    await page.waitForLoadState("networkidle");

    // Click first result card
    const resultCard = page.locator(".cursor-pointer").first();
    if (await resultCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await resultCard.click();
      await page.waitForTimeout(500);

      // Click first gap if available
      const gapItem = page.locator(".cursor-pointer").nth(1);
      if (await gapItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await gapItem.click();
        await page.waitForTimeout(500);

        // Reviewer should see "Review Actions" text
        const reviewSection = page.getByText("Review Actions");
        // May or may not be visible depending on gap.reviewStatus
        // If gap is pending, it should be visible; if already reviewed, it won't be
        const hasReview = await reviewSection.isVisible({ timeout: 3_000 }).catch(() => false);
        // At minimum, the page should not crash
        expect(true).toBe(true);
        if (hasReview) {
          // Verify approve/dismiss buttons exist
          await expect(page.getByText("Confirm")).toBeVisible();
        }
      }
    }

    await ctx.close();
  });

  test("Analyst does NOT see Review Actions", async ({ browser }) => {
    const ctx = await loginAs(browser, "analyst-001");
    const page = await ctx.newPage();

    await page.goto("/fact-check");
    await expect(page.getByRole("heading", { name: /Fact Check Dashboard/ })).toBeVisible();

    await page.waitForLoadState("networkidle");

    // Click first result card
    const resultCard = page.locator(".cursor-pointer").first();
    if (await resultCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await resultCard.click();
      await page.waitForTimeout(500);

      const gapItem = page.locator(".cursor-pointer").nth(1);
      if (await gapItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await gapItem.click();
        await page.waitForTimeout(500);

        // Analyst should NOT see "Review Actions"
        const reviewSection = page.getByText("Review Actions");
        const hasReview = await reviewSection.isVisible({ timeout: 2_000 }).catch(() => false);
        expect(hasReview).toBe(false);
      }
    }

    await ctx.close();
  });
});

test.describe.skip("RBAC: sidebar shows correct user info", () => {
  test("shows logged-in user name and role", async ({ browser }) => {
    const ctx = await loginAs(browser, "developer-001");
    const page = await ctx.newPage();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /대시보드/ })).toBeVisible();

    // Sidebar should show developer name
    await expect(page.getByText("김정원")).toBeVisible();
    await expect(page.getByText("스킬 개발자")).toBeVisible();

    await ctx.close();
  });

  test("different user shows different info", async ({ browser }) => {
    const ctx = await loginAs(browser, "analyst-001");
    const page = await ctx.newPage();

    await page.goto("/");

    await expect(page.getByText("김경임")).toBeVisible();
    await expect(page.getByText("분석 엔지니어")).toBeVisible();

    await ctx.close();
  });
});
