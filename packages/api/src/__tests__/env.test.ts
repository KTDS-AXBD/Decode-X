import { describe, it, expect } from "vitest";
import { SERVICE_MAP } from "../env.js";

describe("SERVICE_MAP", () => {
  it("11개 서비스 매핑이 존재한다", () => {
    expect(Object.keys(SERVICE_MAP)).toHaveLength(11);
  });

  it("모든 값이 SVC_ 접두사를 가진다", () => {
    for (const value of Object.values(SERVICE_MAP)) {
      expect(value).toMatch(/^SVC_/);
    }
  });

  it("필수 서비스가 모두 포함된다", () => {
    const required = [
      "ingestion", "extraction", "policy", "ontology", "skills",
      "llm", "security", "governance", "notification", "analytics", "mcp",
    ];
    for (const name of required) {
      expect(SERVICE_MAP).toHaveProperty(name);
    }
  });

  it("queue-router는 포함하지 않는다 (내부 전용)", () => {
    expect(SERVICE_MAP).not.toHaveProperty("queue-router");
  });
});
