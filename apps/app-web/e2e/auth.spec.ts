import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("unauthenticated user is redirected to /login", async ({ browser }) => {
    // Fresh context with no stored auth
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  test("login page renders demo user cards", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "AI Foundry" })).toBeVisible();
    await expect(page.getByText("서민원")).toBeVisible();
    await expect(page.getByText("양대진")).toBeVisible();
    await ctx.close();
  });

  test("demo login redirects to dashboard", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByText("서민원").click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: /대시보드/ })).toBeVisible();
    await ctx.close();
  });

  test("logout returns to login page", async ({ page }) => {
    // Uses pre-authed storageState
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /대시보드/ })).toBeVisible();

    // Click logout icon button (title="로그아웃")
    await page.locator('button[title="로그아웃"]').click();
    await expect(page).toHaveURL(/\/login/);
  });
});
