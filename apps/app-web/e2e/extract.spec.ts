// F401 (TD-41): test.describe.skip 해제
import { test, expect } from "@playwright/test";

test.describe("Extract group", () => {
  test("dashboard renders", async ({ page }) => {
    await page.goto("/?legacy=1");
    await expect(page.getByRole("heading", { name: /대시보드 Dashboard/ })).toBeVisible();
  });

  test("document upload page renders", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /문서 업로드/ })).toBeVisible();
  });

  test("source upload page renders", async ({ page }) => {
    await page.goto("/source-upload");
    await expect(page.getByRole("heading", { name: /소스코드 업로드/ })).toBeVisible();
  });

  // /analysis → Navigate to /executive/overview (F377 archive)
  test("analysis route redirects to executive overview", async ({ page }) => {
    await page.goto("/analysis");
    await expect(page).toHaveURL(/\/executive\/overview/);
  });

  test("analysis report page renders", async ({ page }) => {
    await page.goto("/analysis-report");
    await expect(page.getByRole("heading", { name: /분석 리포트/ })).toBeVisible();
  });
});
