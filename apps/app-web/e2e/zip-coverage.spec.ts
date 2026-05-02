import { test, expect } from "@playwright/test";

const TRIAGE_FIXTURE = {
  success: true,
  data: {
    documents: [
      {
        documentId: "doc-1",
        extractionId: "ext-1",
        processCount: 5,
        entityCount: 10,
        ruleCount: 3,
        relationshipCount: 7,
        triageScore: 0.72,
        triageRank: "high",
        analysisStatus: null,
        analysisId: null,
        analyzedAt: null,
        extractedAt: "2026-05-01T00:00:00.000Z",
        chunkSummary: {
          projectName: "lpon-charge",
          controllerCount: 14,
          endpointCount: 47,
          dataModelCount: 22,
          transactionCount: 31,
          ddlTableCount: 8,
          mapperCount: 9,
          totalFiles: 88,
          javaFiles: 60,
          sqlFiles: 12,
          extractionRate: 1.0,
          cappedAtMaxFiles: false,
        },
        isLibOnly: false,
        partialExtraction: null,
      },
      {
        documentId: "doc-2",
        extractionId: "ext-2",
        processCount: 0,
        entityCount: 0,
        ruleCount: 0,
        relationshipCount: 0,
        triageScore: 0.0,
        triageRank: "low",
        analysisStatus: null,
        analysisId: null,
        analyzedAt: null,
        extractedAt: "2026-05-01T00:00:00.000Z",
        chunkSummary: {
          projectName: "lpon-d7lib",
          controllerCount: 0,
          endpointCount: 0,
          dataModelCount: 0,
          transactionCount: 0,
          ddlTableCount: 0,
          mapperCount: 0,
          totalFiles: 12,
          javaFiles: 12,
          sqlFiles: 0,
          extractionRate: 1.0,
          cappedAtMaxFiles: false,
        },
        isLibOnly: true,
        partialExtraction: null,
      },
      {
        documentId: "doc-3",
        extractionId: "ext-3",
        processCount: 1,
        entityCount: 2,
        ruleCount: 0,
        relationshipCount: 0,
        triageScore: 0.05,
        triageRank: "low",
        analysisStatus: null,
        analysisId: null,
        analyzedAt: null,
        extractedAt: "2026-05-01T00:00:00.000Z",
        chunkSummary: {
          projectName: "companybatch",
          controllerCount: 2,
          endpointCount: 5,
          dataModelCount: 3,
          transactionCount: 1,
          ddlTableCount: 0,
          mapperCount: 0,
          totalFiles: 8,
          javaFiles: 8,
          sqlFiles: 0,
          totalEntriesInZip: 200,
          oversizedSkippedCount: 192,
          extractionRate: 0.04,
          cappedAtMaxFiles: false,
        },
        isLibOnly: false,
        partialExtraction: {
          rate: 0.04,
          severity: "HIGH",
          reasons: ["192개 파일 size 초과 skip", "추출률 4%"],
        },
      },
    ],
    summary: {
      total: 3,
      analyzed: 0,
      notAnalyzed: 3,
      highPriority: 1,
      mediumPriority: 0,
      lowPriority: 2,
    },
  },
};

const DOCUMENTS_FIXTURE = {
  success: true,
  data: {
    documents: [
      { document_id: "doc-1", original_name: "lpon-charge.zip", file_type: "zip", status: "parsed", file_size_byte: 102400, uploaded_at: "2026-05-01T00:00:00.000Z" },
      { document_id: "doc-2", original_name: "lpon-d7lib.zip", file_type: "zip", status: "parsed", file_size_byte: 51200, uploaded_at: "2026-05-01T00:00:00.000Z" },
      { document_id: "doc-3", original_name: "companybatch.zip", file_type: "zip", status: "parsed", file_size_byte: 26214400, uploaded_at: "2026-05-01T00:00:00.000Z" },
    ],
  },
};

test.describe("zip spec coverage 가시화", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/analysis/triage*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(TRIAGE_FIXTURE),
      })
    );
    await page.route("**/api/documents*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(DOCUMENTS_FIXTURE),
      })
    );
    await page.goto("/analysis-report?view=triage");
  });

  test("정상 zip은 expand 시 spec 매트릭스 표시", async ({ page }) => {
    const row = page.locator("tr").filter({ hasText: "lpon-charge.zip" });
    await row.locator("button[aria-label='Toggle details']").click();
    await expect(page.locator("text=Endpoint").first()).toBeVisible();
    await expect(page.locator("text=47").first()).toBeVisible();
    await expect(page.locator("text=Transaction").first()).toBeVisible();
  });

  test("lib-only zip은 라이브러리 badge 표시", async ({ page }) => {
    const row = page.locator("tr").filter({ hasText: "lpon-d7lib.zip" });
    await expect(row.locator("text=라이브러리")).toBeVisible();
  });

  test("partial extract zip은 부분 % badge 표시", async ({ page }) => {
    const row = page.locator("tr").filter({ hasText: "companybatch.zip" });
    await expect(row.locator("text=부분 4%")).toBeVisible();
  });
});
