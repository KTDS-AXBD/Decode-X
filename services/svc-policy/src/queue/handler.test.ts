import { describe, it, expect } from "vitest";
import { processQueueEvent } from "./handler.js";
import type { Env } from "../env.js";

const dummyEnv = {} as Env;
const dummyCtx = { waitUntil: () => {} } as unknown as ExecutionContext;

describe("processQueueEvent", () => {
  it("rejects invalid pipeline event", async () => {
    const res = await processQueueEvent({ bad: "data" }, dummyEnv, dummyCtx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid pipeline event");
  });

  it("ignores non-extraction.completed events", async () => {
    const event = {
      eventId: "00000000-0000-0000-0000-000000000001",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "document.uploaded",
      payload: {
        documentId: "doc-1",
        organizationId: "org-1",
        uploadedBy: "user-1",
        r2Key: "docs/file.pdf",
        fileType: "pdf",
        fileSizeByte: 1024,
        originalName: "file.pdf",
      },
    };
    const res = await processQueueEvent(event, dummyEnv, dummyCtx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ignored");
  });

  it("processes extraction.completed event successfully", async () => {
    const event = {
      eventId: "00000000-0000-0000-0000-000000000002",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "extraction.completed",
      payload: {
        documentId: "doc-1",
        extractionId: "ext-1",
        processNodeCount: 5,
        entityCount: 10,
      },
    };
    const res = await processQueueEvent(event, dummyEnv, dummyCtx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; extractionId: string };
    expect(body.status).toBe("processed");
    expect(body.extractionId).toBe("ext-1");
  });

  it("rejects event with missing required fields", async () => {
    const event = {
      eventId: "not-a-uuid",
      occurredAt: "bad-date",
      type: "extraction.completed",
      payload: {},
    };
    const res = await processQueueEvent(event, dummyEnv, dummyCtx);
    expect(res.status).toBe(400);
  });
});
