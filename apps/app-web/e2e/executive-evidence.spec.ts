// F403 (F378): /executive/evidence 허브 페이지 E2E 커버리지
import { test, expect } from "@playwright/test";

test.describe("Evidence hub", () => {
  test("renders evidence hub heading", async ({ page }) => {
    await page.goto("/executive/evidence");
    await expect(page.getByRole("heading", { name: /근거 자료/ })).toBeVisible();
  });

  test("tab navigation changes URL search param", async ({ page }) => {
    await page.goto("/executive/evidence");
    // org-spec 탭 클릭
    await page.getByRole("tab", { name: /조직 종합 Spec/ }).click();
    await expect(page).toHaveURL(/tab=org-spec/);
  });
});
