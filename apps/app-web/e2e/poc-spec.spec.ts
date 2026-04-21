// F401 (TD-41): test.describe.skip 해제
// /poc/ai-ready → archived, redirects to /executive/overview (F377)
// /org-spec → still active route
import { test, expect } from "@playwright/test";

test.describe("PoC & Spec pages (Sprint 209~210)", () => {
  // /poc/ai-ready → Navigate to /executive/overview (F377 archive)
  test("poc/ai-ready redirects to executive overview", async ({ page }) => {
    await page.goto("/poc/ai-ready");
    await expect(page).toHaveURL(/\/executive\/overview/);
  });

  test("poc/ai-ready drill-down redirects to executive overview", async ({ page }) => {
    await page.goto("/poc/ai-ready/test-skill");
    await expect(page).toHaveURL(/\/executive\/overview/);
  });

  test("Org 종합 Spec 페이지 렌더링", async ({ page }) => {
    await page.goto("/org-spec");
    await expect(
      page.getByRole("heading", { name: /Org 종합 Spec/ }),
    ).toBeVisible();
    // 3탭 존재
    await expect(page.getByRole("tab", { name: /Business/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Technical/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Quality/ })).toBeVisible();
  });

  test("Org Spec — Business 탭 로딩", async ({ page }) => {
    await page.goto("/org-spec");
    // Business 탭 클릭 시 로딩 또는 콘텐츠 표시
    await page.getByRole("tab", { name: /Business/ }).click();
    // 생성 버튼 또는 요약 카드가 나타날 때까지 대기
    await expect(
      page.getByText(/생성하기|Spec 요약/).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
