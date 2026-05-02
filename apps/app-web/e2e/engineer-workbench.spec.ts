// F403 (F379/F380): /engineer/workbench E2E 커버리지
import { test, expect } from "@playwright/test";

test.describe("Engineer Workbench", () => {
  test("renders workbench with search input", async ({ page }) => {
    await page.goto("/engineer/workbench");
    await expect(page.getByRole("heading", { name: "Engineer Workbench" })).toBeVisible();
    await expect(page.getByPlaceholder("Skill ID 입력...")).toBeVisible();
  });

  test("detail page populates search input with id param", async ({ page }) => {
    await page.goto("/engineer/workbench/test-skill-id");
    const input = page.getByPlaceholder("Skill ID 입력...");
    await expect(input).toHaveValue("test-skill-id");
  });
});
