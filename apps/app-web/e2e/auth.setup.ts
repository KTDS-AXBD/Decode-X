import { test as setup } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildCfAuthorizationCookie } from "./fixtures/auth/cf-access-cookie";

const AUTH_FILE = "e2e/.auth/user.json";

// TD-41 (Sprint 253): VITE_DEMO_MODE=1 + ?demo=1 bypass (F401) +
// CF_Authorization cookie injection (proper mock infrastructure).
// Cookie is captured in storageState so all subsequent tests have it.
setup("authenticate via ?demo=1 + CF_Authorization cookie", async ({ page }) => {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Inject CF_Authorization cookie before navigation so it's captured in storageState
  await page.context().addCookies([buildCfAuthorizationCookie()]);

  // Navigate with ?demo=1 — triggers demo auth in AuthContext (VITE_DEMO_MODE=1)
  await page.goto("/?demo=1");

  // Wait for auth to complete (redirect to /executive/overview)
  await page.waitForURL(/\/executive\/overview/, { timeout: 15_000 });

  // Save storageState including localStorage + CF_Authorization cookie
  await page.context().storageState({ path: AUTH_FILE });
});
