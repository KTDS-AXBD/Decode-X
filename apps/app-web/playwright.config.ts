import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests against staging backend (DEV_PROXY=remote).
 * Auth state is saved once via auth.setup.ts and reused by all tests.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 1,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: process.env["CI"] ? "github" : "list",

  use: {
    baseURL: "http://localhost:5173",
    storageState: "e2e/.auth/user.json",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Setup: login once, save storageState
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { storageState: undefined } },

    // All tests depend on setup
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "DEV_PROXY=remote pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
    // F401 demo bypass — CI는 .github/workflows/ci.yml의 env 블록으로 동일 값을 주입.
    // 로컬에서는 이 env 블록이 dev 서버에 VITE_DEMO_MODE를 전달해 ?demo=1 우회를 활성화한다.
    env: {
      VITE_DEMO_MODE: "1",
    },
  },
});
