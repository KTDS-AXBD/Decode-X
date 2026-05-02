// F403 (F384): /?demo=guest Guest mode E2E 커버리지
// guest mode는 기존 engineer storageState와 격리하여 실행
import { test, expect } from "@playwright/test";

test.describe("Guest demo mode", () => {
  // storageState를 무효화하여 신선한 브라우저 컨텍스트로 실행
  test.use({ storageState: { cookies: [], origins: [] } });

  test("demo=guest shows GuestBlockedView on blocked route", async ({ page }) => {
    // guest 세션 초기화
    await page.goto("/?demo=guest");
    await page.waitForTimeout(500);
    // 차단 라우트 이동
    await page.goto("/upload");
    await expect(page.getByText(/데모 모드에서 사용할 수 없는 기능/)).toBeVisible();
    // <main> 스코프로 격리 — Sidebar의 동일 텍스트 링크와 strict mode 충돌 방지
    await expect(page.locator("main").getByRole("link", { name: /로그인하기/ })).toBeVisible();
  });

  test("demo=guest shows Demo Mode badge in sidebar", async ({ page }) => {
    await page.goto("/?demo=guest");
    await page.waitForTimeout(500);
    // 🎭 Demo Mode 배지 가시
    await expect(page.getByText("Demo Mode")).toBeVisible();
  });
});
