import { describe, it, expect } from "vitest";
import { SERVICE_MAP, RESOURCE_MAP, PREFIX_STRIP_MAP } from "../env.js";

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
      "ingestion", "extraction", "policy", "ontology", "skill",
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

describe("RESOURCE_MAP", () => {
  it("Pages Function ROUTE_TABLE과 동일한 리소스를 매핑한다", () => {
    const expectedResources = [
      "documents", "extractions", "extract", "analysis", "analyze",
      "factcheck", "specs", "export", "policies", "sessions", "skills",
      "terms", "graph", "normalize", "audit", "cost", "trust",
      "prompts", "golden-tests", "quality-evaluations", "chat",
      "notifications", "kpi", "dashboards", "quality", "reports", "deliverables",
    ];
    for (const res of expectedResources) {
      expect(RESOURCE_MAP).toHaveProperty(res);
    }
    expect(Object.keys(RESOURCE_MAP)).toHaveLength(expectedResources.length);
  });

  it("모든 값이 유효한 SVC_ 바인딩을 참조한다", () => {
    const validBindings = new Set(Object.values(SERVICE_MAP));
    for (const binding of Object.values(RESOURCE_MAP)) {
      expect(validBindings).toContain(binding);
    }
  });

  it("RESOURCE_MAP + PREFIX_STRIP_MAP이 외부 노출 서비스를 커버한다", () => {
    const allRoutes = { ...RESOURCE_MAP, ...PREFIX_STRIP_MAP };
    const routeBindings = new Set(Object.values(allRoutes));
    // LLM Router는 내부 전용 (다른 Worker가 Service Binding으로 호출)
    const internalOnly = new Set(["SVC_LLM_ROUTER"]);
    const allBindings = new Set(Object.values(SERVICE_MAP));
    for (const binding of allBindings) {
      if (internalOnly.has(binding)) continue;
      expect(routeBindings).toContain(binding);
    }
  });

  it("PREFIX_STRIP_MAP에 mcp가 포함된다", () => {
    expect(PREFIX_STRIP_MAP).toHaveProperty("mcp");
    expect(PREFIX_STRIP_MAP["mcp"]).toBe("SVC_MCP_SERVER");
  });
});
