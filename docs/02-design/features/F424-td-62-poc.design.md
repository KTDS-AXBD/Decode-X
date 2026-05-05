---
id: AIF-DSGN-055
title: "F424 — TD-62 web-tree-sitter Workers polyfill PoC 설계"
sprint: 256
f_items: [F424]
plan: AIF-PLAN-055
status: Active
created: "2026-05-05"
author: "Autopilot (session 268)"
---

# F424 — TD-62 web-tree-sitter Workers polyfill PoC 설계

## 1. 문제 분석

### 1.1 오류 원인

```
node_modules/web-tree-sitter/lib/web-tree-sitter.js:1527
await import("module"); var require = createRequire(import.meta.url)
```

- emscripten 자동 생성 ESM wrapper가 Node.js `module` 패키지를 dynamic import 후 `createRequire` 초기화
- Cloudflare Workers ESBuild bundle 환경에서 `import.meta.url` = `undefined` → `createRequire(undefined)` throw
- `nodejs_compat` flag는 `node:module` polyfill이지 `import.meta.url` stub이 아님

### 1.2 패키지 구조 (web-tree-sitter@0.26.8)

```
node_modules/web-tree-sitter/
├── lib/
│   ├── web-tree-sitter.js        ← ESM entry (문제 라인 1527)
│   └── web-tree-sitter.wasm      ← WASM 바이너리
├── web-tree-sitter.cjs           ← CJS entry (있으면 옵션 B 대상)
└── package.json                  ← exports 필드 확인 필요
```

## 2. PoC 아키텍처

### 2.1 격리 환경

```
scripts/poc/td-62/
├── wrangler.toml          ← minimal Workers (D1/R2/Queue 없음)
├── package.json           ← scripts, local overrides
├── src/
│   └── index.ts           ← web-tree-sitter import + parse 1건
└── patches/               ← 옵션 C patch-package 용
    └── web-tree-sitter+0.26.8.patch
```

### 2.2 검증 기준 (stdout 패턴)

wrangler dev 부팅 PASS = 아래 2가지 모두 충족:

```json
// HTTP GET / → 200 응답 body
{
  "status": "ok",
  "parse": {
    "rootType": "program",
    "childCount": 1,
    "annotations": ["@RestController", "@RequestMapping"]
  }
}
```

fail = 아래 중 하나:
- `TypeError: createRequire(undefined)` 
- Cloudflare deploy validation error code 10021
- `import.meta.url` 관련 에러

## 3. 우회 패턴 3종 상세 설계

### 3.1 옵션 A — esbuild --define:import.meta.url stub

**핵심**: build-time에 `import.meta.url`을 고정 문자열로 치환

```toml
# wrangler.toml [build] 섹션
[build]
command = """
node_modules/.bin/esbuild src/index.ts \
  --bundle \
  --platform=browser \
  --define:import.meta.url='"file:///worker.js"' \
  --external:node:module \
  --outfile=dist/index.js
"""
```

**제약 사항**:
- `wrangler dev` custom [build].command는 wrangler binding 통합(D1/R2) 우회
- PoC는 binding 없는 minimal Worker라 이 제약 비해당
- `--external:node:module`로 `import("module")` 자체를 외부화 → bundle 미포함

**검증 순서**:
1. `wrangler build` 또는 `esbuild` 직접 실행 → `dist/index.js` 생성 확인
2. `wrangler dev` 부팅 (localhost:8787)
3. `curl localhost:8787/` → parse 결과 JSON 확인

### 3.2 옵션 B — package.json exports cjs alias

**핵심**: workerd 환경에서 cjs entry를 강제 사용 (cjs는 `createRequire(import.meta.url)` 미사용)

```json
// scripts/poc/td-62/package.json imports 필드
{
  "imports": {
    "#web-tree-sitter": {
      "workerd": "../../node_modules/web-tree-sitter/web-tree-sitter.cjs",
      "default": "web-tree-sitter"
    }
  }
}
```

```ts
// src/index.ts
import Parser from '#web-tree-sitter';  // → workerd 환경에서 cjs 경로 사용
```

**사전 조건**: `web-tree-sitter.cjs` 파일 존재 여부 확인
```bash
ls node_modules/web-tree-sitter/web-tree-sitter.cjs
```

**검증 순서**:
1. cjs 파일 존재 확인
2. `wrangler dev` 부팅
3. parse 결과 JSON 확인

### 3.3 옵션 C — patch-package 직접 patch

**핵심**: 문제 라인 1527을 직접 제거 (require를 no-op으로 대체)

```diff
# patches/web-tree-sitter+0.26.8.patch
-     await import("module"); var require = createRequire(import.meta.url);
+     var require = function() { return {}; };  // Workers: Node.js fallback disabled
```

**주의**: emscripten 출력에서 `require`는 WASM load fallback용. WASM binary가 직접 instantiate되면 `require`는 호출되지 않음. no-op 대체가 안전할 가능성 높음.

**검증 순서**:
1. `patch-package` 설치 + patch 파일 생성
2. `pnpm patch-package` 적용 확인
3. `wrangler dev` 부팅
4. parse 결과 JSON 확인 + Language.load API 정상 동작 확인

## 4. 구현 파일 목록 (Worker 매핑)

| 파일 | 용도 | 옵션 |
|------|------|------|
| `scripts/poc/td-62/wrangler.toml` | minimal Workers 설정 | A/B/C 공통 |
| `scripts/poc/td-62/src/index.ts` | web-tree-sitter import + parse 1건 | A/B/C 공통 |
| `scripts/poc/td-62/package.json` | local scripts + imports 필드 | B에서 imports 추가 |
| `scripts/poc/td-62/patches/web-tree-sitter+0.26.8.patch` | patch-package 패치 | C 전용 |
| `reports/td-62-poc-2026-05-05.md` | PoC 결과 리포트 | Step 5 산출 |

## 5. 테스트 계약

PoC 성공 기준 (하나라도 충족 시 GO):

| 검증 | 성공 기준 | 실패 시 |
|------|----------|---------|
| `wrangler dev` 부팅 | localhost:8787 응답 | 다음 옵션으로 |
| parse 1건 | rootType=program + annotation 포함 | 다음 옵션으로 |
| staging deploy | Cloudflare API 2xx (reject 아닌) | 옵션 D 권고 |

PoC NEGATIVE 기준 (모두 fail 시 NO-GO):
- 옵션 A, B, C 모두 `wrangler dev` 부팅 실패
- 또는 deploy validation 모두 error code 10021

## 6. 결과물 → Sprint 257 입력

| PoC 결과 | Sprint 257 계획 |
|----------|----------------|
| GO (1+ 옵션 PASS) | F358 Phase 2 재시도 — 해당 패턴 적용 |
| NO-GO (모두 fail) | emscripten output fork (~2주) 또는 F358 무기한 보류 |
