// F437 (AIF-REQ-018 Phase 2): GaugeSet RadialBarChart 렌더링 E2E 스모크
// SPEC §4 #6 UX F-item Must — UX 접점 변경은 E2E 스모크 1건 이상 필수
import { test, expect } from "@playwright/test";

test.describe("GaugeSet RadialBarChart (F437)", () => {
  test("status tab renders GaugeSet with 3 gauge labels", async ({ page }) => {
    await page.goto("/analysis-report?view=status");
    await page.waitForLoadState("networkidle");

    // GaugeSet 컨테이너가 DOM에 존재
    const gaugeSet = page.locator('[data-testid="gauge-set"]');
    await expect(gaugeSet).toBeVisible({ timeout: 10_000 });

    // 3개 게이지 label 텍스트 확인
    await expect(page.getByText("정책 승인율").first()).toBeVisible();
    await expect(page.getByText("활용 준비도").first()).toBeVisible();
    await expect(page.getByText("신뢰도").first()).toBeVisible();
  });
});
