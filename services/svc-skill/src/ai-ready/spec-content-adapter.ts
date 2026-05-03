import type { SkillPackage } from "@ai-foundry/types";
import type { SpecContent } from "./prompts.js";

export function skillPackageToSpecContent(
  pkg: SkillPackage,
): { specContent: SpecContent; skillName: string } {
  const skillName = [pkg.metadata.domain, pkg.metadata.subdomain]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/\s+/g, "-");

  const originalRules = [buildRulesTable(pkg)];

  const runbooks = pkg.policies.map((p) =>
    [
      `## ${p.code}: ${p.title}`,
      "",
      `**Domain**: ${pkg.metadata.domain}`,
      "",
      "### 운영 가이드",
      "",
      `**Condition (When)**: ${p.condition}`,
      `**Criteria (If)**: ${p.criteria}`,
      `**Outcome (Then)**: ${p.outcome}`,
      p.tags.length > 0 ? `**Tags**: ${p.tags.join(", ")}` : null,
      `**Trust**: ${p.trust.level} (score: ${p.trust.score})`,
    ]
      .filter((line) => line !== null)
      .join("\n"),
  );

  const tests = pkg.policies.map((p) => {
    // F417: augmented bundles embed concrete test scenarios in description field
    if (p.description?.startsWith("---TEST_SCENARIOS---")) {
      return `skill: ${skillName}\npolicy: ${p.code}\n${p.description}`;
    }
    return [
      `skill: ${skillName}`,
      `policy: ${p.code}`,
      `scenario: ${p.title}`,
      "given:",
      `  - "${p.condition} 조건 충족"`,
      "when:",
      `  criteria: "${p.criteria}"`,
      "then:",
      `  outcome: "${p.outcome}"`,
      `  trust: "${p.trust.level}"`,
    ].join("\n");
  });

  const contractYaml = buildContractYaml(pkg, skillName);
  const provenanceYaml = buildProvenanceYaml(pkg, skillName);

  const specContent: SpecContent = {
    rules: [...originalRules],
    originalRules,
    emptySlotRules: [],
    runbooks,
    tests,
    contractYaml,
    provenanceYaml,
  };

  return { specContent, skillName };
}

function buildRulesTable(pkg: SkillPackage): string {
  const header = [
    `# Skill Rules — ${pkg.metadata.domain}`,
    "",
    "## Business Logic Rules",
    "",
    "| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |",
    "|----|-----------------|---------------|----------------|-----------------|",
  ];

  const rows = pkg.policies.map((p) => {
    const exception = p.exception ?? "—"; // TD-58 / F418: Else branch (was incorrectly p.source.excerpt)
    return `| ${p.code} | ${p.condition} | ${p.criteria} | ${p.outcome} | ${exception} |`;
  });

  return [...header, ...rows].join("\n");
}

function buildContractYaml(pkg: SkillPackage, skillName: string): string {
  const policyCodes = pkg.policies.map((p) => `  - ${p.code}`).join("\n");
  return [
    `skill: ${skillName}`,
    `version: ${pkg.metadata.version}`,
    `trust: ${pkg.trust.level} (${pkg.trust.score})`,
    "policies:",
    policyCodes,
  ].join("\n");
}

function buildProvenanceYaml(pkg: SkillPackage, skillName: string): string {
  const { provenance, trust } = pkg;
  const docIds = provenance.sourceDocumentIds.map((d) => `  - ${d}`).join("\n") || "  []";
  const stages = provenance.pipeline.stages.map((s) => `  - ${s}`).join("\n") || "  []";
  const businessRules = pkg.policies.map((p) => `  - ${p.code}`).join("\n");

  return [
    `skillId: ${pkg.skillId}`,
    `skillName: ${skillName}`,
    `organizationId: ${provenance.organizationId}`,
    `extractedAt: ${provenance.extractedAt}`,
    "sources:",
    docIds,
    "pipeline:",
    "  stages:",
    stages,
    "trust:",
    `  level: ${trust.level}`,
    `  score: ${trust.score}`,
    "businessRules:",
    businessRules,
  ].join("\n");
}
