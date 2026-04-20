import { describe, it, expect } from "vitest";
import { reconcile } from "../reconcile.js";
import type { SourceAnalysisResult, HttpMethod, DocApiSpec } from "@ai-foundry/types";

function makeSource(endpoints: Array<{ method: string; path: string; paramCount?: number }>): SourceAnalysisResult {
  return {
    projectName: "lpon-payment",
    controllers: [
      {
        className: "LponPaymentController",
        packageName: "com.ktds.lpon",
        basePath: "",
        sourceFile: "LponPaymentController.java",
        endpoints: endpoints.map(({ method, path, paramCount = 0 }) => ({
          httpMethod: [method as HttpMethod],
          path,
          methodName: "method",
          returnType: "Object",
          parameters: Array.from({ length: paramCount }, (_, i) => ({
            name: `p${i}`,
            type: "Object",
            required: true,
          })),
        })),
      },
    ],
    dataModels: [],
    transactions: [],
    ddlTables: [],
    stats: {
      totalFiles: 1,
      javaFiles: 1,
      sqlFiles: 0,
      controllerCount: 1,
      endpointCount: endpoints.length,
      dataModelCount: 0,
      transactionCount: 0,
      ddlTableCount: 0,
      mapperCount: 0,
    },
  };
}

function makeDoc(endpoints: Array<{ method: string; path: string; paramCount?: number }>): DocApiSpec {
  return {
    projectName: "lpon-payment",
    endpoints: endpoints.map(({ method, path, paramCount = 0 }) => ({
      method,
      path,
      params: Array.from({ length: paramCount }, (_, i) => ({
        name: `p${i}`,
        type: "string",
        required: true,
      })),
    })),
  };
}

describe("reconcile — Source-First Reconciliation Engine", () => {
  it("SOURCE_MISSING: source endpoint not in doc", () => {
    const source = makeSource([{ method: "POST", path: "/charge", paramCount: 1 }]);
    const doc = makeDoc([]);

    const report = reconcile(source, doc);

    expect(report.summary.sourceMissing).toBe(1);
    expect(report.summary.docOnly).toBe(0);
    expect(report.summary.divergences).toBe(0);
    expect(report.results[0]?.marker).toBe("SOURCE_MISSING");
    expect(report.results[0]?.subject).toBe("/charge");
  });

  it("DOC_ONLY: doc endpoint not in source", () => {
    const source = makeSource([]);
    const doc = makeDoc([{ method: "GET", path: "/balance/{accountNo}", paramCount: 1 }]);

    const report = reconcile(source, doc);

    expect(report.summary.docOnly).toBe(1);
    expect(report.summary.sourceMissing).toBe(0);
    expect(report.results[0]?.marker).toBe("DOC_ONLY");
  });

  it("DIVERGENCE: param count mismatch — KPI 2 검증", () => {
    // Source has POST /cancel with 2 params; doc specifies 3 params
    const source = makeSource([{ method: "POST", path: "/cancel", paramCount: 2 }]);
    const doc = makeDoc([{ method: "POST", path: "/cancel", paramCount: 3 }]);

    const report = reconcile(source, doc);

    const divergence = report.results.find((r) => r.marker === "DIVERGENCE");
    expect(divergence).toBeDefined();
    expect(divergence?.marker).toBe("DIVERGENCE");
    expect(divergence?.divergenceReason).toContain("paramCount");
    expect(report.summary.divergences).toBeGreaterThanOrEqual(1);

    // Log for KPI visibility
    console.log("DIVERGENCE marker generated:", divergence?.divergenceReason);
  });

  it("no markers when source and doc match perfectly", () => {
    const source = makeSource([
      { method: "POST", path: "/charge", paramCount: 1 },
      { method: "GET", path: "/balance/{accountNo}", paramCount: 1 },
    ]);
    const doc = makeDoc([
      { method: "POST", path: "/charge", paramCount: 1 },
      { method: "GET", path: "/balance/:accountNo", paramCount: 1 },
    ]);

    const report = reconcile(source, doc);

    expect(report.summary.total).toBe(0);
    expect(report.results).toHaveLength(0);
  });

  it("path normalization: {id} and :id treated as same", () => {
    const source = makeSource([{ method: "GET", path: "/users/{id}", paramCount: 1 }]);
    const doc = makeDoc([{ method: "GET", path: "/users/:id", paramCount: 1 }]);

    const report = reconcile(source, doc);

    expect(report.summary.total).toBe(0);
  });

  it("report contains projectName and analyzedAt", () => {
    const source = makeSource([]);
    const doc = makeDoc([]);
    const report = reconcile(source, doc);
    expect(report.projectName).toBe("lpon-payment");
    expect(report.analyzedAt).toBeTruthy();
  });

  it("mixed scenario: SOURCE_MISSING + DOC_ONLY + DIVERGENCE simultaneously", () => {
    const source = makeSource([
      { method: "POST", path: "/charge", paramCount: 1 },   // SOURCE_MISSING (not in doc)
      { method: "POST", path: "/cancel", paramCount: 2 },   // DIVERGENCE (doc has 3 params)
    ]);
    const doc = makeDoc([
      { method: "GET", path: "/balance", paramCount: 0 },    // DOC_ONLY (not in source)
      { method: "POST", path: "/cancel", paramCount: 3 },    // DIVERGENCE partner
    ]);

    const report = reconcile(source, doc);

    expect(report.summary.sourceMissing).toBe(1);
    expect(report.summary.docOnly).toBe(1);
    expect(report.summary.divergences).toBe(1);
    expect(report.summary.total).toBe(3);
  });
});
