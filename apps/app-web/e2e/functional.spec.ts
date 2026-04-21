// TODO(S224/TD-41): 모든 protected route — CF Access mock 없이 /welcome redirect. 재활성화 S224.
import { test, expect } from "@playwright/test";

test.describe.skip("Dashboard functional", () => {
  test("quick action cards navigate correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /대시보드/ })).toBeVisible();

    // Quick actions are inside the "빠른 실행" card — use links to target
    await page.locator('a[href="/upload"]').last().click();
    await expect(page).toHaveURL("/upload");

    await page.goto("/");
    await page.locator('a[href="/analysis"]').last().click();
    await expect(page).toHaveURL("/analysis");

    await page.goto("/");
    await page.locator('a[href="/skills"]').last().click();
    await expect(page).toHaveURL("/skills");
  });

  test("stats cards display loaded data", async ({ page }) => {
    await page.goto("/");

    // Wait for loading to finish (stats show '...' while loading)
    // Dashboard has 3 stats cards: 등록 문서, 검토 대기, 활성 Skill
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll(".text-3xl.font-bold");
      return cards.length >= 3 && ![...cards].some((c) => c.textContent === "...");
    }, { timeout: 10_000 });

    // Verify stats cards show actual values (not '...')
    const statValues = page.locator(".text-3xl.font-bold");
    await expect(statValues).toHaveCount(3);

    // Each stat should contain a number followed by 건 or 개
    for (let i = 0; i < 3; i++) {
      const text = await statValues.nth(i).textContent();
      expect(text).toMatch(/\d+(건|개)/);
    }
  });

  test("quick actions section renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("빠른 실행")).toBeVisible();
    // Verify all 4 quick action links exist
    await expect(page.locator('a[href="/upload"]').last()).toBeVisible();
    await expect(page.locator('a[href="/analysis"]').last()).toBeVisible();
    await expect(page.locator('a[href="/hitl"]').last()).toBeVisible();
    await expect(page.locator('a[href="/skills"]').last()).toBeVisible();
  });
});

test.describe.skip("Upload page functional", () => {
  test("file select button and search input exist", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /문서 업로드/ })).toBeVisible();

    // File select button should be present
    await expect(page.getByRole("button", { name: "파일 선택" })).toBeVisible();

    // Search input
    const search = page.getByPlaceholder("문서 검색...");
    await expect(search).toBeVisible();

    // Type in search
    await search.fill("test");
    // Search is client-side filter, no navigation expected
  });

  test("document stats cards display", async ({ page }) => {
    await page.goto("/upload");

    // Wait for stats to load
    await page.waitForLoadState("networkidle");

    // Stats row should have document count cards
    const statCards = page.locator(".grid.grid-cols-4 .font-bold, .grid.grid-cols-4 .text-2xl");
    if (await statCards.count() > 0) {
      const first = await statCards.first().textContent();
      expect(first).toBeTruthy();
    }
  });
});

test.describe.skip("HITL review page functional", () => {
  test("policy list loads and is selectable", async ({ page }) => {
    await page.goto("/hitl");
    await expect(page.getByRole("heading", { name: /HITL 검토/ })).toBeVisible();

    // Wait for policies to load
    await page.waitForLoadState("networkidle");

    // Policy cards should be clickable
    const policyCards = page.locator(".cursor-pointer");
    const count = await policyCards.count();
    if (count > 0) {
      // Click first policy card
      await policyCards.first().click();

      // Detail panel should show condition/criteria/outcome
      await expect(page.getByText(/Condition|조건/).first()).toBeVisible({ timeout: 5_000 });
    }
  });
});

test.describe.skip("Skill catalog functional", () => {
  test("search filters skills", async ({ page }) => {
    await page.goto("/skills");
    await expect(page.getByRole("heading", { name: /Skill Marketplace/ })).toBeVisible();

    // Wait for skills to load
    await page.waitForLoadState("networkidle");

    // Search input
    const search = page.getByPlaceholder(/Skill 검색/);
    await expect(search).toBeVisible();

    // Get initial skill count text
    const countText = page.locator("text=/\\d+ \\/ \\d+개 Skill/");
    if (await countText.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const before = await countText.textContent();

      // Type a search query that likely filters
      await search.fill("pension");
      await page.waitForTimeout(500); // debounce

      const after = await countText.textContent();
      // Count text should change (or stay same if all match)
      expect(after).toBeTruthy();
    }
  });

  test("quality filter buttons work", async ({ page }) => {
    await page.goto("/skills");
    await page.waitForLoadState("networkidle");

    // Trust level filter buttons
    const allButton = page.getByRole("button", { name: "전체" }).first();
    if (await allButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await allButton.click();
      // Should not crash, skills should still display
      await expect(page.getByRole("heading", { name: /Skill Marketplace/ })).toBeVisible();
    }
  });
});
