// TODO(S224/TD-41): /poc/ai-ready, /org-spec protected route — CF Access mock 후 재활성화.
import { test, expect } from "@playwright/test";

test.describe.skip("PoC & Spec pages (Sprint 209~210)", () => {
  test("AI-Ready 채점 리포트 페이지 렌더링", async ({ page }) => {
    await page.goto("/poc/ai-ready");
    await expect(
      page.getByRole("heading", { name: /AI-Ready 6기준 채점 리포트/ }),
    ).toBeVisible();
    // KPI 섹션 존재 확인
    await expect(page.getByText("KPI 달성도")).toBeVisible();
  });

  test("AI-Ready drill-down 페이지 진입", async ({ page }) => {
    await page.goto("/poc/ai-ready");
    // 스킬 링크가 있으면 첫 번째 클릭
    const skillLink = page.locator('a[href*="/poc/ai-ready/"]').first();
    if (await skillLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await skillLink.click();
      await expect(page.url()).toContain("/poc/ai-ready/");
    }
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
