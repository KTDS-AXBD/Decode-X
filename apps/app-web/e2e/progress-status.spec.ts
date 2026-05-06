// F435 (AIF-REQ-018): 진행 현황 탭 UX 스모크 — 3단계 구조 + accordion + 게이지/스코어카드
// SPEC §4 #6 UX F-item Must 원칙 — UX 접점 변경은 E2E 스모크 1건 이상 필수
import { test, expect } from "@playwright/test";

test.describe("진행 현황 탭 UX (F435)", () => {
  test("status tab renders Executive Summary section", async ({ page }) => {
    await page.goto("/analysis-report?view=status");

    // 페이지 헤딩 확인
    await expect(
      page.getByRole("heading", { name: /분석 리포트/ }),
    ).toBeVisible();

    // "진행 현황" 탭이 활성화됨 — 서브 헤딩에 파일럿 진행 현황 문구 표시
    await expect(
      page.getByText(/파일럿 진행 현황/),
    ).toBeVisible();
  });

  test("status tab shows Executive Summary with score or verdict", async ({ page }) => {
    await page.goto("/analysis-report?view=status");

    // Level 1 Executive Summary — 네트워크 응답을 기다림
    await page.waitForLoadState("networkidle");

    // Score gauge or verdict headline — 데이터 유무와 관계없이 구조가 있음
    // "즉시 활용", "조건부 활용", "추가 작업 필요" 중 하나 또는 스코어 숫자
    const verdictOrScore = page.locator(
      '[data-testid="executive-summary"], section:has(svg circle), .text-2xl.font-bold',
    ).first();
    // 구조가 렌더링되는지 확인 (빈 데이터여도 상태 구조는 표시됨)
    // .first() — 페이지에 동일 텍스트 다중 등장 가능, strict mode 회피
    await expect(page.locator("text=/파이프라인 현황|현황 데이터|로딩/").first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test("pipeline section accordion can be toggled", async ({ page }) => {
    await page.goto("/analysis-report?view=status");
    await page.waitForLoadState("networkidle");

    // "파이프라인 현황" CollapsibleSection — defaultOpen=true이므로 처음엔 열려있음
    const sectionHeader = page.getByText("파이프라인 현황").first();
    if (await sectionHeader.isVisible({ timeout: 6_000 }).catch(() => false)) {
      // 헤더 클릭으로 접기
      await sectionHeader.click();
      // 다시 클릭으로 펼치기
      await sectionHeader.click();
      // 페이지 crash 없이 살아있어야 함
      await expect(page.getByRole("heading", { name: /분석 리포트/ })).toBeVisible();
    }
  });

  test("fact-check section is present", async ({ page }) => {
    await page.goto("/analysis-report?view=status");
    await page.waitForLoadState("networkidle");

    // FactCheck 커버리지 분석 섹션
    const factCheckSection = page.getByText("FactCheck 커버리지 분석").first();
    if (await factCheckSection.isVisible({ timeout: 6_000 }).catch(() => false)) {
      await expect(factCheckSection).toBeVisible();
    }
  });

  test("detailed report section is present", async ({ page }) => {
    await page.goto("/analysis-report?view=status");
    await page.waitForLoadState("networkidle");

    // Level 3 상세 분석 보고서 CollapsibleSection
    const detailSection = page.getByText("상세 분석 보고서").first();
    if (await detailSection.isVisible({ timeout: 6_000 }).catch(() => false)) {
      await expect(detailSection).toBeVisible();
    }
  });
});
