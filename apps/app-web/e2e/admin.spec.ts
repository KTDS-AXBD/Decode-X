// F401 (TD-41): test.describe.skip 해제 — VITE_DEMO_MODE=1 + ?demo=1 bypass 적용
import { test, expect } from "@playwright/test";

test.describe("Experience group", () => {
  test("mockup page renders", async ({ page }) => {
    await page.goto("/mockup");
    await expect(page.getByRole("heading", { name: /Working Mock-up/ })).toBeVisible();
  });

  test("PoC report page renders", async ({ page }) => {
    await page.goto("/poc-report");
    await expect(page.getByRole("heading", { name: /PoC 보고서/ })).toBeVisible();
  });
});

test.describe("Admin group", () => {
  test("ontology page renders", async ({ page }) => {
    await page.goto("/ontology");
    await expect(page.getByRole("heading", { name: /온톨로지 탐색기/ })).toBeVisible();
  });

  // /benchmark → Navigate to /executive/overview (F377 archive)
  test("benchmark route redirects to executive overview", async ({ page }) => {
    await page.goto("/benchmark");
    await expect(page).toHaveURL(/\/executive\/overview/);
  });

  test("settings page renders", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /설정 Settings/ })).toBeVisible();
  });

  test("guide page renders", async ({ page }) => {
    await page.goto("/guide");
    await expect(page.getByRole("heading", { name: /이용 가이드/ })).toBeVisible();
  });
});

test.describe("Error handling", () => {
  test("404 page renders for unknown route", async ({ page }) => {
    await page.goto("/nonexistent-route");
    await expect(page.getByText("페이지를 찾을 수 없습니다")).toBeVisible();
  });
});

// F403 (F382/F387): /admin 대시보드 + AuditLog 탭
test.describe("Admin dashboard (F403)", () => {
  test("admin page renders dashboard heading", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /Admin 대시보드/ })).toBeVisible();
  });

  test("AuditLog tab switch renders audit tab content", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("tablist").getByRole("tab", { name: /감사 로그/ }).click();
    // fetch 안정 후 평가 — AuditLog 뷰 토글 버튼은 mount 즉시 렌더되고 fetch 결과와 무관
    await page.waitForLoadState("networkidle");
    const activePanel = page.locator('[role="tabpanel"][data-state="active"]');
    await expect(activePanel).toBeVisible();
  });
});
