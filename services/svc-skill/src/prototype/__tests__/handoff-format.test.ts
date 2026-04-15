/**
 * Foundry-X 핸드오프 포맷 검증 테스트 (Sprint 201)
 *
 * PrototypeManifest / PrototypeOrigin Zod schema가 실제 packager 출력을
 * 파싱할 수 있는지 검증한다. 이 테스트가 PASS하면 Foundry-X가
 * 기대하는 포맷과 AI Foundry 출력이 일치함을 보장한다.
 */
import { describe, it, expect } from "vitest";
import { createManifest } from "../packager.js";
import { PrototypeManifestSchema, PrototypeOriginSchema } from "@ai-foundry/types";
import type { GeneratedFile, PrototypeOrigin } from "@ai-foundry/types";

// ── 헬퍼 ────────────────────────────────────────

function makeFile(
  path: string,
  type: GeneratedFile["type"],
  generatedBy: GeneratedFile["generatedBy"] = "mechanical",
): GeneratedFile {
  return { path, content: `content for ${path}`, type, generatedBy, sourceCount: 1 };
}

const BASE_FILES: GeneratedFile[] = [
  makeFile(".foundry/origin.json", "meta"),
  makeFile("rules/business-rules.json", "rules"),
  makeFile("ontology/terms.jsonld", "ontology"),
  makeFile("README.md", "readme", "template"),
  makeFile("specs/01-business-logic.md", "spec", "llm-sonnet"),
  makeFile("specs/02-data-model.md", "spec", "llm-sonnet"),
  makeFile("specs/03-functions.md", "spec", "llm-sonnet"),
  makeFile("specs/04-architecture.md", "spec", "llm-sonnet"),
  makeFile("specs/05-api.md", "spec", "llm-sonnet"),
  makeFile("CLAUDE.md", "spec", "mechanical"),
];

const SCREEN_FILE = makeFile("specs/06-screens.md", "spec", "llm-sonnet");

// ── 테스트 ───────────────────────────────────────

describe("Foundry-X 핸드오프 포맷 검증", () => {
  it("createManifest() 출력이 PrototypeManifestSchema Zod 파싱을 통과한다", () => {
    const manifestFile = createManifest("TestOrg", BASE_FILES, { includeScreenSpec: false });
    const raw = JSON.parse(manifestFile.content) as unknown;

    const result = PrototypeManifestSchema.safeParse(raw);
    expect(result.success, `Zod parse 실패: ${JSON.stringify(result.error?.issues ?? [])}`).toBe(true);
  });

  it("PrototypeOriginSchema가 origin.json 포맷을 파싱한다", () => {
    const origin: PrototypeOrigin = {
      organizationId: "org-001",
      organizationName: "TestOrg",
      domain: "test-domain",
      generatedAt: new Date().toISOString(),
      generatedBy: "ai-foundry-prototype-generator",
      version: "1.0.0",
      pipeline: {
        documentCount: 10,
        policyCount: 50,
        termCount: 30,
        skillCount: 5,
        extractionCount: 100,
      },
    };

    const result = PrototypeOriginSchema.safeParse(origin);
    expect(result.success, `Zod parse 실패: ${JSON.stringify(result.error?.issues ?? [])}`).toBe(true);
  });

  it("includeScreenSpec=true 시 manifest.files에 specs/06-screens.md 경로가 포함된다", () => {
    const allFiles = [...BASE_FILES, SCREEN_FILE];
    const manifestFile = createManifest("TestOrg", allFiles, { includeScreenSpec: true });
    const raw = JSON.parse(manifestFile.content) as { files: Array<{ path: string }> };

    const paths = raw.files.map((f) => f.path);
    expect(paths).toContain("specs/06-screens.md");
  });

  it("includeScreenSpec=false 시 manifest.files에 specs/06-screens.md 경로가 없다", () => {
    const manifestFile = createManifest("TestOrg", BASE_FILES, { includeScreenSpec: false });
    const raw = JSON.parse(manifestFile.content) as { files: Array<{ path: string }> };

    const paths = raw.files.map((f) => f.path);
    expect(paths).not.toContain("specs/06-screens.md");
  });

  it("manifest에 9종 필수 파일 경로가 모두 포함된다 (includeScreenSpec=true)", () => {
    const allFiles = [...BASE_FILES, SCREEN_FILE];
    const manifestFile = createManifest("TestOrg", allFiles, { includeScreenSpec: true });
    const raw = JSON.parse(manifestFile.content) as { files: Array<{ path: string }> };

    const paths = raw.files.map((f) => f.path);
    const expectedPaths = [
      ".foundry/origin.json",
      "rules/business-rules.json",
      "ontology/terms.jsonld",
      "specs/01-business-logic.md",
      "specs/02-data-model.md",
      "specs/03-functions.md",
      "specs/04-architecture.md",
      "specs/05-api.md",
      "specs/06-screens.md",
      "CLAUDE.md",
    ];

    for (const expected of expectedPaths) {
      expect(paths, `${expected} 경로 누락`).toContain(expected);
    }
  });
});
