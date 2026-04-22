/**
 * sample-loader.ts — spec-container fs 기반 로더 (F402 TD-42 재작)
 *
 * .decode-x/spec-containers/lpon-{name}/ 디렉토리를 직접 읽어 SkillMeta를 반환한다.
 * Sprint 230 API 기반(GET /skills/:id)에서 전환 — production API는 메타만 반환하며
 * 실 spec 컨텐츠는 R2 또는 파일시스템에 존재하기 때문 (TD-42).
 */

import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { SpecContent } from "../../services/svc-skill/src/ai-ready/prompts.js";

export interface SkillMeta {
  id: string;             // container dirname (e.g., "lpon-charge")
  name: string;           // same as id
  specContent: SpecContent;
}

async function readMarkdownFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  return Promise.all(files.map((f) => readFile(join(dir, f), "utf-8")));
}

/**
 * rules/ 디렉토리를 BL 원본(`{skill}-rules.md`)과 Empty Slot 보완(`ES-*.md`)로 분리.
 * 7 lpon-* container 컨벤션에 따라 파일명 패턴으로 분류한다.
 */
async function readRulesSplit(dir: string): Promise<{ originalRules: string[]; emptySlotRules: string[] }> {
  if (!existsSync(dir)) return { originalRules: [], emptySlotRules: [] };
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  const originalFiles = files.filter((f) => !f.startsWith("ES-"));
  const emptySlotFiles = files.filter((f) => f.startsWith("ES-"));
  const [originalRules, emptySlotRules] = await Promise.all([
    Promise.all(originalFiles.map((f) => readFile(join(dir, f), "utf-8"))),
    Promise.all(emptySlotFiles.map((f) => readFile(join(dir, f), "utf-8"))),
  ]);
  return { originalRules, emptySlotRules };
}

async function readYamlFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
  return Promise.all(files.map((f) => readFile(join(dir, f), "utf-8")));
}

async function readContractYaml(testsDir: string): Promise<string> {
  const contractDir = join(testsDir, "contract");
  if (!existsSync(contractDir)) return "";
  const files = await readdir(contractDir);
  const yaml = files.find((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  if (!yaml) return "";
  return readFile(join(contractDir, yaml), "utf-8");
}

async function loadContainer(containerDir: string): Promise<SkillMeta> {
  const name = containerDir.split("/").at(-1) ?? containerDir;

  const [provenanceYaml, rulesSplit, runbooks, tests, contractYaml] = await Promise.all([
    readFile(join(containerDir, "provenance.yaml"), "utf-8").catch(() => ""),
    readRulesSplit(join(containerDir, "rules")),
    readMarkdownFiles(join(containerDir, "runbooks")),
    readYamlFiles(join(containerDir, "tests")),
    readContractYaml(join(containerDir, "tests")),
  ]);

  const { originalRules, emptySlotRules } = rulesSplit;
  const rules = [...originalRules, ...emptySlotRules];

  return {
    id: name,
    name,
    specContent: { rules, originalRules, emptySlotRules, runbooks, tests, contractYaml, provenanceYaml },
  };
}

/**
 * spec-containers 디렉토리 하위 lpon-* 컨테이너를 모두 로드한다.
 * specDir 기본값: .decode-x/spec-containers (프로젝트 루트 기준)
 */
export async function loadSpecContainers(specDir: string): Promise<SkillMeta[]> {
  if (!existsSync(specDir)) {
    throw new Error(`spec-container 디렉토리 없음: ${specDir}`);
  }
  const entries = await readdir(specDir, { withFileTypes: true });
  const containerDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => join(specDir, e.name))
    .sort();

  if (containerDirs.length === 0) {
    throw new Error(`spec-container 없음: ${specDir}`);
  }

  return Promise.all(containerDirs.map(loadContainer));
}
