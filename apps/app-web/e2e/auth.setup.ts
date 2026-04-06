import { test as setup, expect } from "@playwright/test";

const AUTH_FILE = "e2e/.auth/user.json";

setup("login as admin", async ({ page }) => {
  await page.goto("/login");

  // Wait for demo user cards to render
  await expect(page.getByRole("heading", { name: "AI Foundry" })).toBeVisible();

  // Click the first demo user card (서민원, admin-001)
  await page.getByText("서민원").click();

  // Should redirect to dashboard
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /대시보드/ })).toBeVisible();

  // Save auth state for reuse
  await page.context().storageState({ path: AUTH_FILE });
});
