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
    const mockDoc = {
      success: true,
      data: {
        organizationId: "Miraeasset",
        type: "business",
        generatedAt: "2026-04-29T00:00:00.000Z",
        skillCount: 8,
        sections: [
          { id: "s1", title: "개요", content: "퇴직연금 비즈니스 Spec 개요입니다.", order: 1 },
          { id: "s2", title: "핵심 정책", content: "주요 정책 목록입니다.", order: 2 },
        ],
        metadata: {
          domain: "pension",
          totalPolicies: 24,
          avgTrustScore: 0.87,
          aiReadyScore: { business: 0.91, technical: 0.85, quality: 0.78 },
        },
      },
    };

    await page.route("**/api/skills/org/*/spec/business", (route) =>
      route.fulfill({ json: mockDoc }),
    );

    await page.goto("/org-spec");
    await page.getByRole("tab", { name: /Business/ }).click();
    await expect(
      page.getByText(/Spec 요약/).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
