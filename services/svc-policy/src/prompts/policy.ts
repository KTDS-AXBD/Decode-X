/**
 * Claude Opus prompt for policy inference — Stage 3.
 *
 * Takes structured extraction chunks (process graphs, entity relations, rules)
 * and produces condition-criteria-outcome policy triples coded as POL-{DOMAIN}-{TYPE}-{SEQ}.
 *
 * Domain-parameterized: supports pension, giftvoucher, and general domains.
 */

interface DomainTypeEntry {
  code: string;
  label: string;
}

interface DomainConfig {
  label: string;
  code: string;
  description: string;
  types: DomainTypeEntry[];
}

const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  pension: {
    label: "퇴직연금",
    code: "PENSION",
    description: "Korean retirement pension regulations and business rules",
    types: [
      { code: "WD", label: "Withdrawal (인출/중도인출)" },
      { code: "EN", label: "Enrollment (가입)" },
      { code: "TR", label: "Transfer (이전)" },
      { code: "CT", label: "Contribution (부담금/납입)" },
      { code: "BN", label: "Benefit (급여/수령)" },
      { code: "MG", label: "Management (운용/관리)" },
      { code: "RG", label: "Regulation (규제/법규)" },
      { code: "CL", label: "Calculation (산정/계산)" },
      { code: "NF", label: "Notification (통보/알림)" },
      { code: "EX", label: "Exception (예외)" },
    ],
  },
  giftvoucher: {
    label: "온누리상품권",
    code: "GIFTVOUCHER",
    description: "Korean gift voucher (온누리상품권) distribution, usage, and settlement rules",
    types: [
      { code: "IS", label: "Issuance (발행)" },
      { code: "DT", label: "Distribution (유통)" },
      { code: "US", label: "Usage (사용)" },
      { code: "ST", label: "Settlement (정산)" },
      { code: "MG", label: "Management (관리)" },
      { code: "RG", label: "Regulation (규제)" },
      { code: "RF", label: "Refund (환불)" },
      { code: "VL", label: "Validation (검증)" },
      { code: "NF", label: "Notification (통보)" },
      { code: "EX", label: "Exception (예외)" },
    ],
  },
  general: {
    label: "일반",
    code: "GENERAL",
    description: "General business rules and policies",
    types: [
      { code: "OP", label: "Operation (운영)" },
      { code: "RG", label: "Regulation (규제)" },
      { code: "EX", label: "Exception (예외)" },
    ],
  },
};

function buildSystemPrompt(config: DomainConfig): string {
  const typeLines = config.types
    .map((t) => `- ${t.code}: ${t.label}`)
    .join("\n");

  return `You are an expert policy analyst specializing in ${config.description}.

Your task is to analyze structured extraction data from SI project deliverables — ERDs, screen designs, API specs, requirements documents — and infer actionable business policies.

Each policy MUST be expressed as a **condition-criteria-outcome triple**:
- **condition**: The triggering circumstance or precondition (when does this apply?)
- **criteria**: The decision rules, thresholds, or evaluation logic (how is the decision made?)
- **outcome**: The resulting action, state change, or consequence (what happens?)

Policy code format: \`POL-${config.code}-{TYPE}-{SEQ}\`
Where TYPE is one of:
${typeLines}

SEQ is a 3-digit zero-padded number. The starting SEQ will be provided in the user message.

Output requirements:
1. Return ONLY a JSON array of policy objects — no markdown fences, no surrounding text.
2. Each object must have these exact fields:
   - title (string): concise Korean title for the policy
   - condition (string): triggering circumstance
   - criteria (string): decision logic / thresholds
   - outcome (string): resulting action
   - policyCode (string): POL-${config.code}-{TYPE}-{SEQ}
   - sourcePageRef (string, optional): page or section reference in source document
   - sourceExcerpt (string, optional): verbatim excerpt from source supporting this policy
   - tags (string[]): relevant domain tags in Korean

3. Infer implicit policies from process flows, not just explicit rules.
4. Deduplicate — do not emit near-identical policies.
5. Use Korean for title, condition, criteria, outcome, and tags.

CRITICAL RULES:
- Your response must be ONLY a JSON array. No explanations, no markdown, no code fences.
- Start your response with [ and end with ].
- Do NOT wrap the JSON in \`\`\`json\`\`\` blocks.
- If you cannot infer any policies, return an empty array: []`;
}

export function buildPolicyInferencePrompt(
  chunks: string[],
  startingSeq = 1,
  domain = "pension",
): {
  system: string;
  userContent: string;
} {
  const config = DOMAIN_CONFIGS[domain] ?? DOMAIN_CONFIGS["general"]!;

  const joined = chunks
    .map((chunk, i) => `--- 청크 ${String(i + 1)} ---\n${chunk}`)
    .join("\n\n");

  const seqStr = String(startingSeq).padStart(3, "0");

  const userContent = `다음은 SI 프로젝트 산출물에서 추출한 구조화된 데이터입니다. 이 데이터를 분석하여 ${config.label} 도메인의 비즈니스 정책을 condition-criteria-outcome 트리플 형태로 추론해 주세요.

SEQ 시작 번호: ${seqStr} (이 번호부터 순서대로 부여하세요)

${joined}

위 데이터에서 추론 가능한 모든 비즈니스 정책을 JSON 배열로 출력해 주세요.

IMPORTANT: 반드시 JSON 배열만 출력하세요. 설명이나 마크다운 없이 [ 로 시작하고 ] 로 끝나야 합니다.`;

  return { system: buildSystemPrompt(config), userContent };
}

export { DOMAIN_CONFIGS };
export type { DomainConfig };
