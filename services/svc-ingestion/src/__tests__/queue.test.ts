import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as XLSX from "xlsx";
import { processQueueEvent } from "../queue.js";
import type { Env } from "../env.js";

// ── Magic bytes for valid file formats ──────────────────────────

// PDF magic bytes: %PDF-1.7\n%
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25]);
// OOXML (ZIP/PK) magic bytes for xlsx/docx/pptx
const OOXML_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// ── Mock response for Unstructured.io API ───────────────────────

const unstructuredElements = [
  { type: "Title", text: "퇴직연금 설계서" },
  { type: "NarrativeText", text: "요구사항 정의 문서입니다." },
  { type: "Text", text: "" }, // blank — should be skipped
];

// ── Helpers ─────────────────────────────────────────────────────

function mockDb() {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockR2(objectExists = true, magic: Uint8Array = PDF_MAGIC): R2Bucket {
  const body = magic.buffer;
  return {
    get: vi.fn().mockResolvedValue(
      objectExists
        ? { arrayBuffer: vi.fn().mockResolvedValue(body) }
        : null,
    ),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    head: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket;
}

function mockEnv(r2Exists = true, magic: Uint8Array = PDF_MAGIC): Env {
  return {
    DB_INGESTION: mockDb(),
    R2_DOCUMENTS: mockR2(r2Exists, magic),
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    SECURITY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { maskedText: "masked" } }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-ingestion",
    MAX_FILE_SIZE_MB: "50",
    INTERNAL_API_SECRET: "test-secret",
    UNSTRUCTURED_API_URL: "https://api.unstructured.io",
    UNSTRUCTURED_API_KEY: "test-key",
  };
}

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

const validDocumentUploadedEvent = {
  eventId: "550e8400-e29b-41d4-a716-446655440000",
  occurredAt: "2026-02-28T00:00:00.000Z",
  type: "document.uploaded" as const,
  payload: {
    documentId: "doc-1",
    organizationId: "org-1",
    uploadedBy: "user-1",
    r2Key: "documents/org-1/doc-1/file.pdf",
    fileType: "pdf" as const,
    fileSizeByte: 1024,
    originalName: "file.pdf",
  },
};

// ── Tests ────────────────────────────────────────────────────────

describe("processQueueEvent", () => {
  let env: Env;
  let ctx: ExecutionContext;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    env = mockEnv();
    ctx = mockCtx();
    originalFetch = globalThis.fetch;
    // Mock globalThis.fetch for Unstructured.io API calls
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify(unstructuredElements), { status: 200 }),
    ));
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 200 with skipped=true for invalid pipeline event", async () => {
    const res = await processQueueEvent({ bad: "data" }, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; skipped: boolean; reason: string };
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("invalid_event");
  });

  it("returns 200 with skipped=true for non-document.uploaded events", async () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440001",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "extraction.completed",
      payload: {
        documentId: "doc-1",
        extractionId: "ext-1",
        organizationId: "org-1",
        processNodeCount: 5,
        entityCount: 10,
      },
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; skipped: boolean; reason: string };
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("not_our_event");
  });

  it("processes document.uploaded event successfully", async () => {
    const res = await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; documentId: string; chunkCount: number };
    expect(body.ok).toBe(true);
    expect(body.documentId).toBe("doc-1");
    // 2 non-blank elements (Title + NarrativeText), blank Text is skipped
    expect(body.chunkCount).toBe(2);
  });

  it("fetches R2 object with correct key", async () => {
    await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    expect(env.R2_DOCUMENTS.get).toHaveBeenCalledWith("documents/org-1/doc-1/file.pdf");
  });

  it("returns 500 when R2 object not found", async () => {
    const envNoR2 = mockEnv(false);
    const res = await processQueueEvent(validDocumentUploadedEvent, envNoR2, ctx);
    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("r2_object_not_found");
  });

  it("marks document as failed when R2 object not found", async () => {
    const envNoR2 = mockEnv(false);
    await processQueueEvent(validDocumentUploadedEvent, envNoR2, ctx);
    expect(envNoR2.DB_INGESTION.prepare).toHaveBeenCalled();
  });

  it("updates document status to parsed on success", async () => {
    await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    const prepareMock = env.DB_INGESTION.prepare as ReturnType<typeof vi.fn>;
    const prepareCalls = prepareMock.mock.calls as Array<[string]>;
    const updateCalls = prepareCalls.filter(
      (call) => call[0].includes("parsed"),
    );
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it("publishes ingestion.completed event with quality metadata", async () => {
    await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    const sendMock = env.QUEUE_PIPELINE.send as ReturnType<typeof vi.fn>;
    expect(sendMock).toHaveBeenCalledTimes(1);
    const event = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event["type"]).toBe("ingestion.completed");
    const payload = event["payload"] as Record<string, unknown>;
    expect(payload["documentId"]).toBe("doc-1");
    expect(typeof payload["parseDurationMs"]).toBe("number");
    expect(typeof payload["chunksValid"]).toBe("number");
  });

  it("inserts chunks into document_chunks table", async () => {
    await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    const prepareMock = env.DB_INGESTION.prepare as ReturnType<typeof vi.fn>;
    const prepareCalls = prepareMock.mock.calls as Array<[string]>;
    const insertCalls = prepareCalls.filter(
      (call) => call[0].includes("INSERT INTO document_chunks"),
    );
    // 2 non-blank chunks
    expect(insertCalls).toHaveLength(2);
  });

  it("uses correct MIME mapping for file types", async () => {
    // Create a real xlsx file for the custom parser
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A"], ["1"]]), "S1");
    const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as number[];
    const xlsxBytes = new Uint8Array(arr);

    const xlsxEnv = mockEnv(true, OOXML_MAGIC);
    (xlsxEnv.R2_DOCUMENTS.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(xlsxBytes.buffer),
    });
    const xlsxEvent = {
      ...validDocumentUploadedEvent,
      payload: {
        ...validDocumentUploadedEvent.payload,
        fileType: "xlsx" as const,
        originalName: "data.xlsx",
      },
    };
    const res = await processQueueEvent(xlsxEvent, xlsxEnv, ctx);
    expect(res.status).toBe(200);
  });

  it("marks document as failed when processing throws", async () => {
    // Make fetch throw to simulate parse failure
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Parse failed"));

    const res = await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Parse failed");
  });

  it("returns encrypted_scdsa002 for Samsung SDS encrypted file", async () => {
    // SCDSA002 header (Samsung SDS encrypted)
    const scdsa = new Uint8Array([0x53, 0x43, 0x44, 0x53, 0x41, 0x30, 0x30, 0x32, 0x00, 0x00]);
    const scdsaEnv = mockEnv(true, scdsa);
    const res = await processQueueEvent(validDocumentUploadedEvent, scdsaEnv, ctx);
    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string; detail: string };
    expect(body.error).toBe("encrypted_scdsa002");
    expect(body.detail).toContain("SCDSA002");
  });

  it("sets document status to encrypted for SCDSA002 files", async () => {
    const scdsa = new Uint8Array([0x53, 0x43, 0x44, 0x53, 0x41, 0x30, 0x30, 0x32, 0x00, 0x00]);
    const scdsaEnv = mockEnv(true, scdsa);
    await processQueueEvent(validDocumentUploadedEvent, scdsaEnv, ctx);
    const prepareMock = scdsaEnv.DB_INGESTION.prepare as ReturnType<typeof vi.fn>;
    const prepareCalls = prepareMock.mock.calls as Array<[string]>;
    // Should use parameterized status (not hardcoded 'failed')
    const updateCall = prepareCalls.find(
      (call) => call[0].includes("UPDATE documents SET status = ?"),
    );
    expect(updateCall).toBeDefined();
    // Check that bind was called with 'encrypted' status
    const bindMock = prepareMock.mock.results[0]?.value?.bind as ReturnType<typeof vi.fn>;
    expect(bindMock).toHaveBeenCalledWith("encrypted", expect.stringContaining("SCDSA002"), "encrypted_scdsa002", "doc-1");
  });

  it("returns format_invalid for non-SCDSA non-standard file format", async () => {
    // Random non-standard header (not SCDSA002)
    const badMagic = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const badEnv = mockEnv(true, badMagic);
    const res = await processQueueEvent(validDocumentUploadedEvent, badEnv, ctx);
    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.error).toBe("format_invalid");
  });

  // ── xlsx dispatch tests ─────────────────────────────────────────

  it("uses custom parseXlsx for xlsx files instead of Unstructured.io", async () => {
    // Create a real xlsx buffer
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["ID", "Name"], ["1", "Alice"]]), "Sheet1");
    const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as number[];
    const xlsxBuf = new Uint8Array(arr);

    const xlsxEnv = mockEnv(true);
    // Override R2 to return real xlsx bytes
    (xlsxEnv.R2_DOCUMENTS.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(xlsxBuf.buffer),
    });

    const xlsxEvent = {
      ...validDocumentUploadedEvent,
      payload: {
        ...validDocumentUploadedEvent.payload,
        fileType: "xlsx" as const,
        originalName: "테이블정의서.xlsx",
      },
    };

    const res = await processQueueEvent(xlsxEvent, xlsxEnv, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; chunkCount: number };
    expect(body.ok).toBe(true);
    // Should have chunks from custom parser (summary + sheet data)
    expect(body.chunkCount).toBeGreaterThanOrEqual(1);
    // Unstructured.io should NOT have been called
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("uses custom parseXlsx for xls files", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A"], ["1"]]), "S1");
    const arr = XLSX.write(wb, { type: "array", bookType: "biff8" }) as number[];
    const xlsBuf = new Uint8Array(arr);

    const xlsEnv = mockEnv(true);
    (xlsEnv.R2_DOCUMENTS.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(xlsBuf.buffer),
    });

    const xlsEvent = {
      ...validDocumentUploadedEvent,
      payload: {
        ...validDocumentUploadedEvent.payload,
        fileType: "xls" as const,
        originalName: "legacy.xls",
      },
    };

    const res = await processQueueEvent(xlsEvent, xlsEnv, ctx);
    expect(res.status).toBe(200);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("still uses Unstructured.io for non-xlsx formats", async () => {
    await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    // PDF should call Unstructured.io via globalThis.fetch
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  // ── 화면설계서 routing to parseScreenDesign ───────────────────

  it("routes 화면설계서 xlsx to parseScreenDesign", async () => {
    // Create a minimal xlsx with screen-design-like data
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["시스템명"], ["퇴직연금"]]),
      "SCR001",
    );
    const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as number[];
    const xlsxBuf = new Uint8Array(arr);

    const screenEnv = mockEnv(true);
    (screenEnv.R2_DOCUMENTS.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(xlsxBuf.buffer),
    });

    const screenEvent = {
      ...validDocumentUploadedEvent,
      payload: {
        ...validDocumentUploadedEvent.payload,
        fileType: "xlsx" as const,
        originalName: "화면설계서_퇴직연금_v1.xlsx",
      },
    };

    const res = await processQueueEvent(screenEvent, screenEnv, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    // Should NOT call Unstructured.io
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("routes non-화면설계 xlsx to parseXlsx", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["테이블ID", "테이블명"], ["TB001", "고객"]]),
      "Sheet1",
    );
    const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as number[];
    const xlsxBuf = new Uint8Array(arr);

    const tableEnv = mockEnv(true);
    (tableEnv.R2_DOCUMENTS.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(xlsxBuf.buffer),
    });

    const tableEvent = {
      ...validDocumentUploadedEvent,
      payload: {
        ...validDocumentUploadedEvent.payload,
        fileType: "xlsx" as const,
        originalName: "테이블정의서_퇴직연금.xlsx",
      },
    };

    const res = await processQueueEvent(tableEvent, tableEnv, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; chunkCount: number };
    expect(body.ok).toBe(true);
    expect(body.chunkCount).toBeGreaterThanOrEqual(1);
    // Should NOT call Unstructured.io
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
