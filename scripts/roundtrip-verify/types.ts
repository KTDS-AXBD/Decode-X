export interface ContractScenario {
  id: string;
  name: string;
  given: Record<string, unknown>;
  when: string;
  then: Record<string, unknown>[];
  ref?: string;
}

export interface ContractFile {
  skillId: string;
  domain: string;
  version?: string;
  scenarios: ContractScenario[];
}

export type FailReason =
  | "WRONG_OUTCOME"
  | "WRONG_VALUE"
  | "UNEXPECTED_ERROR"
  | "EXPECTED_ERROR_MISSING"
  | "UNSUPPORTED_WHEN"   // Domain not implemented in working prototype
  | "STUB_PENDING";      // Edge Spec contract not yet added; stub passes silently

export interface RunResult {
  contractFile: string;
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  failReason?: FailReason;
  failDetail?: string;
}

export interface Report {
  total: number;
  passed: number;
  failed: number;
  consistencyRate: number;
  // Implemented services only (excludes UNSUPPORTED_WHEN scenarios)
  implementedTotal: number;
  implementedPassed: number;
  implementedRate: number;
  results: RunResult[];
  generatedAt: string;
}
