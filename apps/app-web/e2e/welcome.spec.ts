// F404: CF Web Analytics 실 주입 완결 — beacon 콘솔 에러 0건 스모크
import { test, expect } from "@playwright/test";

test.describe("welcome page (unauthenticated)", () => {
  test("renders without CF Analytics console errors", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();

    const analyticsErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (text.includes("cloudflareinsights.com") || text.includes("beacon.min.js")) {
          analyticsErrors.push(text);
        }
      }
    });
    page.on("pageerror", (err) => {
      const msg = err.message;
      if (msg.includes("cloudflareinsights.com") || msg.includes("beacon.min.js")) {
        analyticsErrors.push(msg);
      }
    });

    await page.goto("/welcome");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Decode-X")).toBeVisible();
    await expect(page.getByRole("button", { name: /Google로 로그인/ })).toBeVisible();
    expect(analyticsErrors).toHaveLength(0);

    await ctx.close();
  });
});
