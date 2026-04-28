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

  // F409 (AIF-REQ-037): /api/* proxy fixed in src/worker.ts — skip removed.
  // Worker now routes /api/* → Gateway (JSON 401 without auth, real data with auth).
  // E2E uses DEV_PROXY=remote → Vite proxies to rx.minu.best → app-web Worker adds
  // X-Internal-Secret → Gateway responds with Miraeasset spec data.
  test("Org Spec — Business 탭 로딩", async ({ page }) => {
    await page.goto("/org-spec");
    await page.getByRole("tab", { name: /Business/ }).click();
    await expect(
      page.getByText(/Spec 요약/).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
