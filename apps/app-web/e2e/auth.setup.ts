import { test as setup } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const AUTH_FILE = "e2e/.auth/user.json";

// F401 (TD-41): VITE_DEMO_MODE=1 + ?demo=1 bypass
// AuthContext detects ?demo=1 and stores stub user in localStorage.
// storageState captures localStorage → reused by all subsequent tests.
setup("authenticate via ?demo=1 (F401 demo bypass)", async ({ page }) => {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Navigate with ?demo=1 — triggers demo auth in AuthContext
  await page.goto("/?demo=1");

  // Wait for auth to complete (redirect to /executive/overview)
  await page.waitForURL(/\/executive\/overview/, { timeout: 15_000 });

  // Save storageState including localStorage (contains __demo_user__ key)
  await page.context().storageState({ path: AUTH_FILE });
});
