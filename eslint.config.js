/**
 * ESLint Flat Config — Decode-X
 *
 * harness-kit 플러그인은 Foundry-X 레포의 @foundry-x/harness-kit 에 있어 현 레포에서는 사용 불가.
 * 복원 방법: scripts/install-harness-kit.sh 준비 + 의존성 추가 후 `import { harnessPlugin } from "@foundry-x/harness-kit/eslint"` 재활성화.
 * 지금은 TypeScript 기본 규칙만 유지한다 (AIF-REQ-034 PoC 진행용).
 */
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "**/*.test.ts"],
  },
);
