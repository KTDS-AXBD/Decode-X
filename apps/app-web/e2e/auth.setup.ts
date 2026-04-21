import { test as setup } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const AUTH_FILE = "e2e/.auth/user.json";

// TODO(S224): CF Access JWT mock E2E 재작성
// F389 DEMO_USERS 폐기로 데모 클릭 로그인 불가. CF Access 환경 mock 구현 후 실 로그인 플로우 복원.
// Tech Debt: TD-41 (CF Access E2E mock, S224 F374 Feature Flag 실 분기 활성화 후)
setup("create empty auth state (CF Access mock pending)", async () => {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
});
