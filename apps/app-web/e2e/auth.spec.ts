import { test, expect } from "@playwright/test";

// TODO(S224/TD-41): DEMO_USERS 폐기(F389)로 데모 로그인 기반 테스트 전면 skip.
// CF Access JWT mock 구현 후 재활성화.

test.describe("Authentication", () => {
  test("unauthenticated user is redirected to /welcome", async ({ browser }) => {
    // Fresh context with no stored auth — CF Access cookie absent in CI
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome/);
    await ctx.close();
  });

  test.skip("login page renders demo user cards — DEMO_USERS 폐기(F389)", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "AI Foundry" })).toBeVisible();
    await expect(page.getByText("서민원")).toBeVisible();
    await expect(page.getByText("양대진")).toBeVisible();
    await ctx.close();
  });

  test.skip("demo login redirects to dashboard — DEMO_USERS 폐기(F389)", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByText("서민원").click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: /대시보드/ })).toBeVisible();
    await ctx.close();
  });

  test.skip("logout returns to login page — DEMO_USERS 폐기(F389)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /대시보드/ })).toBeVisible();
    await page.locator('button[title="로그아웃"]').click();
    await expect(page).toHaveURL(/\/login/);
  });
});
