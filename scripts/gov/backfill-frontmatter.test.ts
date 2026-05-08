/**
 * backfill-frontmatter.test.ts — F439 단위 테스트
 *
 * AIF-DSGN-069 §1 (스크립트 구조) §4 (검증 시나리오 단위) 참조.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CATEGORY_MAP,
  EXEMPT_PATTERNS,
  inferTypeFromPath,
  isExempt,
  mapCategory,
} from "./CATEGORY_MAP.js";
import {
  hasFrontmatter,
  inferCode,
  inferTitle,
  prependFrontmatter,
  renderFrontmatter,
  scan,
  type InferredFrontmatter,
} from "./backfill-frontmatter.js";

describe("CATEGORY_MAP.mapCategory", () => {
  it("01-plan/features → plan", () => {
    expect(mapCategory("docs/01-plan/features/F439.plan.md")).toBe("plan");
  });

  it("02-design → design", () => {
    expect(mapCategory("docs/02-design/features/F439.design.md")).toBe(
      "design",
    );
  });

  it("03-analysis → analysis", () => {
    expect(mapCategory("docs/03-analysis/features/F439.analysis.md")).toBe(
      "analysis",
    );
  });

  it("04-report → report", () => {
    expect(mapCategory("docs/04-report/features/F439.report.md")).toBe(
      "report",
    );
  });

  it("reports/ → report", () => {
    expect(mapCategory("reports/sprint-272-some.md")).toBe("report");
  });

  it("poc/ → poc", () => {
    expect(mapCategory("docs/poc/sprint-1-plan.md")).toBe("poc");
  });

  it("req-interview → req-interview", () => {
    expect(mapCategory("docs/req-interview/decode-x-v1.2/prd-v2.md")).toBe(
      "req-interview",
    );
  });

  it("contracts → contracts", () => {
    expect(mapCategory("docs/contracts/api-spec.md")).toBe("contracts");
  });

  it("archive → archive", () => {
    expect(mapCategory("docs/archive/2026-03/old.md")).toBe("archive");
  });

  it("파일명 토큰 .plan.md → plan (디렉토리 미매칭 시)", () => {
    expect(mapCategory("docs/some-other/F100.plan.md")).toBe("plan");
  });

  it("fallback → general", () => {
    expect(mapCategory("docs/random/foo.md")).toBe("general");
  });
});

describe("CATEGORY_MAP.isExempt", () => {
  it("review/round-N 패턴 매칭", () => {
    expect(
      isExempt(
        "docs/req-interview/decode-x-v1.2/review/round-1/codex.md",
      ),
    ).toBe(true);
  });

  it("archive/2026-03 매칭", () => {
    expect(isExempt("docs/archive/2026-03/foo.md")).toBe(true);
  });

  it("decode-x-restructuring/archive 매칭", () => {
    expect(isExempt("docs/decode-x-restructuring/archive/foo.md")).toBe(true);
  });

  it("일반 파일 → 면제 아님", () => {
    expect(isExempt("docs/01-plan/features/F439.plan.md")).toBe(false);
  });
});

describe("inferTypeFromPath", () => {
  it.each([
    ["docs/01-plan/features/F1.md", "PLAN"],
    ["docs/02-design/features/F1.md", "DSGN"],
    ["docs/03-analysis/features/F1.md", "ANLS"],
    ["docs/04-report/features/F1.md", "RPRT"],
    ["reports/sprint-1.md", "RPRT"],
    ["docs/poc/sprint-1.md", "POC"],
    ["docs/req-interview/foo.md", "REQI"],
    ["docs/archive/foo.md", "ARCH"],
    ["docs/random/foo.md", "DOC"],
  ])("%s → %s", (rel, expected) => {
    expect(inferTypeFromPath(rel)).toBe(expected);
  });
});

describe("CATEGORY_MAP / EXEMPT_PATTERNS 표준", () => {
  it("CATEGORY_MAP 9개 키 보유", () => {
    expect(Object.keys(CATEGORY_MAP).length).toBeGreaterThanOrEqual(9);
  });

  it("EXEMPT_PATTERNS 3개 정규식 보유", () => {
    expect(EXEMPT_PATTERNS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("renderFrontmatter", () => {
  const fm: InferredFrontmatter = {
    code: "AIF-DSGN-069",
    title: "Test Title",
    version: "1.0",
    status: "active",
    category: "design",
    created: "2026-05-08",
    updated: "2026-05-08",
    author: "Sinclair Seo",
  };

  it("8 필드 모두 출력", () => {
    const out = renderFrontmatter(fm);
    expect(out).toContain("code: AIF-DSGN-069");
    expect(out).toContain('title: "Test Title"');
    expect(out).toContain("version: 1.0");
    expect(out).toContain("status: active");
    expect(out).toContain("category: design");
    expect(out).toContain("created: 2026-05-08");
    expect(out).toContain("updated: 2026-05-08");
    expect(out).toContain("author: Sinclair Seo");
  });

  it("--- 양 끝 + 빈 줄로 마무리", () => {
    const out = renderFrontmatter(fm);
    expect(out.startsWith("---\n")).toBe(true);
    expect(out.endsWith("---\n\n")).toBe(true);
  });

  it("title 안 큰따옴표 escape", () => {
    const fmQ: InferredFrontmatter = { ...fm, title: 'Has "Quote"' };
    const out = renderFrontmatter(fmQ);
    expect(out).toContain('title: "Has \\"Quote\\""');
  });
});

describe("inferCode", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fm-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("F### → AIF-{TYPE}-F###", () => {
    const f = path.join(tmp, "docs", "01-plan", "features");
    fs.mkdirSync(f, { recursive: true });
    const file = path.join(f, "F439-foo.md");
    fs.writeFileSync(file, "# Foo\n");
    expect(inferCode(file, tmp)).toBe("AIF-PLAN-F439");
  });

  it("TD-## → TD-##", () => {
    const f = path.join(tmp, "docs");
    fs.mkdirSync(f, { recursive: true });
    const file = path.join(f, "TD-29-backfill.md");
    fs.writeFileSync(file, "# TD\n");
    expect(inferCode(file, tmp)).toBe("TD-29");
  });

  it("sprint-N → AIF-{TYPE}-S{N}", () => {
    const f = path.join(tmp, "docs", "02-design", "features");
    fs.mkdirSync(f, { recursive: true });
    const file = path.join(f, "sprint-272.md");
    fs.writeFileSync(file, "# Sprint\n");
    expect(inferCode(file, tmp)).toBe("AIF-DSGN-S272");
  });

  it("AIF-{TYPE}-{NNN} prefix → trailing 토큰 제거", () => {
    const f = path.join(tmp, "docs");
    fs.mkdirSync(f, { recursive: true });
    const file = path.join(f, "AIF-DSGN-069-foo.md");
    fs.writeFileSync(file, "# Foo\n");
    expect(inferCode(file, tmp)).toBe("AIF-DSGN-069");
  });

  it("기타 fallback → AIF-{TYPE}-{slug}", () => {
    const f = path.join(tmp, "docs", "poc");
    fs.mkdirSync(f, { recursive: true });
    const file = path.join(f, "random-name.md");
    fs.writeFileSync(file, "# Random\n");
    expect(inferCode(file, tmp)).toBe("AIF-POC-random-name");
  });
});

describe("inferTitle", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fm-title-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("첫 H1 추출", () => {
    const file = path.join(tmp, "foo.md");
    fs.writeFileSync(file, "# My Real Title\n\nbody\n");
    expect(inferTitle(file, "foo")).toBe("My Real Title");
  });

  it("H1 부재 → fallback", () => {
    const file = path.join(tmp, "no-h1.md");
    fs.writeFileSync(file, "Just body text\n");
    expect(inferTitle(file, "no-h1")).toBe("no h1");
  });
});

describe("hasFrontmatter + prependFrontmatter (idempotent)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fm-idem-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const fm: InferredFrontmatter = {
    code: "AIF-DOC-test",
    title: "Test",
    version: "1.0",
    status: "active",
    category: "general",
    created: "2026-05-08",
    updated: "2026-05-08",
    author: "Sinclair Seo",
  };

  it("frontmatter 미보유 → false → prepend 후 true", () => {
    const file = path.join(tmp, "no-fm.md");
    fs.writeFileSync(file, "# Body\n\n내용\n");
    expect(hasFrontmatter(file)).toBe(false);
    prependFrontmatter(file, fm);
    expect(hasFrontmatter(file)).toBe(true);
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("# Body");
    expect(content).toContain("code: AIF-DOC-test");
  });

  it("이미 frontmatter 보유 → hasFrontmatter true (스크립트 skip)", () => {
    const file = path.join(tmp, "has-fm.md");
    fs.writeFileSync(file, "---\ncode: foo\n---\n\nbody\n");
    expect(hasFrontmatter(file)).toBe(true);
  });
});

describe("scan + 면제 정책 통합", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fm-scan-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("missing + exempt + hasFrontmatter 분류 정확", () => {
    // missing
    const planDir = path.join(tmp, "docs", "01-plan", "features");
    fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(path.join(planDir, "F100-a.md"), "# A\n");

    // exempt (review/round)
    const reviewDir = path.join(
      tmp,
      "docs",
      "req-interview",
      "test",
      "review",
      "round-1",
    );
    fs.mkdirSync(reviewDir, { recursive: true });
    fs.writeFileSync(path.join(reviewDir, "review.md"), "# Review\n");

    // has frontmatter
    const designDir = path.join(tmp, "docs", "02-design", "features");
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(
      path.join(designDir, "F101.md"),
      "---\ncode: AIF-DSGN-X\n---\n\nbody\n",
    );

    // git 호환 위해 init (inferGitDates 안전 fallback 활용)
    const result = scan(["docs"], tmp);
    expect(result.total).toBe(3);
    expect(result.hasFrontmatter).toBe(1);
    expect(result.exempt.length).toBe(1);
    expect(result.missing.length).toBe(1);
    expect(result.willApply.length).toBe(1);
  });
});
