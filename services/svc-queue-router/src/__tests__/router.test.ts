import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Types ────────────────────────────────────────────────────────

interface Env {
  INTERNAL_API_SECRET: string;
  ENVIRONMENT?: string;
  SVC_INGESTION: Fetcher;
  SVC_EXTRACTION: Fetcher;
  SVC_POLICY: Fetcher;
  SVC_ONTOLOGY: Fetcher;
  SVC_SKILL: Fetcher;
}

// ── Helpers ──────────────────────────────────────────────────────

function mockFetcher(): Fetcher {
  return {
    fetch: vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
  } as unknown as Fetcher;
}

function mockEnv(): Env {
  return {
    INTERNAL_API_SECRET: "test-internal-secret",
    ENVIRONMENT: "test",
    SVC_INGESTION: mockFetcher(),
    SVC_EXTRACTION: mockFetcher(),
    SVC_POLICY: mockFetcher(),
    SVC_ONTOLOGY: mockFetcher(),
    SVC_SKILL: mockFetcher(),
  };
}

function mockCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

/** Create a valid pipeline event body */
function makeEvent(
  type: string,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  const basePayloads: Record<string, Record<string, unknown>> = {
    "document.uploaded": {
      documentId: "doc-1",
      organizationId: "org-1",
      uploadedBy: "user-1",
      r2Key: "documents/org-1/test.pdf",
      fileType: "pdf",
      fileSizeByte: 1024,
      originalName: "test.pdf",
    },
    "ingestion.completed": {
      documentId: "doc-1",
      organizationId: "org-1",
      chunkCount: 5,
      classification: "requirements",
      r2Key: "documents/org-1/test.pdf",
    },
    "extraction.completed": {
      documentId: "doc-1",
      extractionId: "ext-1",
      organizationId: "org-1",
      processNodeCount: 3,
      entityCount: 7,
    },
    "policy.candidate_ready": {
      extractionId: "ext-1",
      policyId: "pol-1",
      hitlSessionId: "hitl-1",
      organizationId: "org-1",
      candidateCount: 4,
    },
    "policy.approved": {
      policyId: "pol-1",
      hitlSessionId: "hitl-1",
      organizationId: "org-1",
      approvedBy: "reviewer-1",
      approvedAt: "2026-01-15T10:00:00.000Z",
      policyCount: 3,
    },
    "ontology.normalized": {
      policyId: "pol-1",
      ontologyId: "onto-1",
      organizationId: "org-1",
      termCount: 12,
    },
    "skill.packaged": {
      skillId: "skill-1",
      ontologyId: "onto-1",
      organizationId: "org-1",
      r2Key: "skill-packages/skill-1.skill.json",
      policyCount: 3,
      trustScore: 0.85,
    },
  };

  return {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    occurredAt: "2026-01-15T10:00:00.000Z",
    type,
    payload: { ...(basePayloads[type] ?? {}), ...payload },
  };
}

interface MockMessage {
  id: string;
  body: unknown;
  attempts: number;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
}

function makeMessage(body: unknown, id = "msg-1", attempts = 1): MockMessage {
  return {
    id,
    body,
    attempts,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function makeBatch(messages: MockMessage[]): MessageBatch<unknown> {
  return {
    messages,
    queue: "ai-foundry-pipeline",
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<unknown>;
}

// ── fetch handler tests ──────────────────────────────────────────

describe("svc-queue-router fetch handler", () => {
  let worker: { fetch: (req: Request, env: Env) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
  });

  it("GET /health returns status ok with environment", async () => {
    const res = await worker.fetch(new Request("https://internal/health"), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; environment: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("svc-queue-router");
    expect(body.environment).toBe("test");
  });

  it("GET / requires CF Access JWT (F514 — Sprint 343)", async () => {
    // F514 적용 후: /health 외 외부 라우트는 CF Access JWT 필수.
    // svc-queue-router는 internal pipeline event bus라 외부 GET / 접근은 항상 401.
    const res = await worker.fetch(new Request("https://internal/"), env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toContain("CF Access JWT");
  });

  it("GET /unknown requires CF Access JWT (F514 — Sprint 343)", async () => {
    const res = await worker.fetch(new Request("https://internal/unknown"), env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });
});

// ── queue handler — event routing tests ──────────────────────────

describe("svc-queue-router queue handler — event routing", () => {
  let worker: { fetch: (req: Request, env: Env) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  // ── document.uploaded → SVC_INGESTION + SVC_ANALYTICS ──

  it("routes document.uploaded to SVC_INGESTION", async () => {
    const msg = makeMessage(makeEvent("document.uploaded"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://internal/internal/queue-event");
    expect(init.method).toBe("POST");
  });

  // ── ingestion.completed → SVC_EXTRACTION ──

  it("routes ingestion.completed to SVC_EXTRACTION", async () => {
    const msg = makeMessage(makeEvent("ingestion.completed"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_EXTRACTION.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // ── extraction.completed → SVC_POLICY ──

  it("routes extraction.completed to SVC_POLICY", async () => {
    const msg = makeMessage(makeEvent("extraction.completed"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_POLICY.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // ── policy.candidate_ready → no targets (platform services removed) ──

  it("routes policy.candidate_ready to no targets", async () => {
    const msg = makeMessage(makeEvent("policy.candidate_ready"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    // No service binding should be called
    for (const key of ["SVC_INGESTION", "SVC_EXTRACTION", "SVC_POLICY", "SVC_ONTOLOGY", "SVC_SKILL"] as const) {
      expect((env[key].fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    }
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  // ── policy.approved → SVC_ONTOLOGY ──

  it("routes policy.approved to SVC_ONTOLOGY", async () => {
    const msg = makeMessage(makeEvent("policy.approved"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_ONTOLOGY.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // ── ontology.normalized → SVC_SKILL ──

  it("routes ontology.normalized to SVC_SKILL", async () => {
    const msg = makeMessage(makeEvent("ontology.normalized"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_SKILL.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // ── skill.packaged → no targets (platform services removed) ──

  it("routes skill.packaged to no targets", async () => {
    const msg = makeMessage(makeEvent("skill.packaged"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    // No service binding should be called
    for (const key of ["SVC_INGESTION", "SVC_EXTRACTION", "SVC_POLICY", "SVC_ONTOLOGY", "SVC_SKILL"] as const) {
      expect((env[key].fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    }
    expect(msg.ack).toHaveBeenCalledOnce();
  });
});

// ── queue handler — X-Internal-Secret ────────────────────────────

describe("svc-queue-router queue handler — internal auth header", () => {
  let worker: { fetch: (req: Request, env: Env) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  it("includes X-Internal-Secret header in dispatches to primary target", async () => {
    const msg = makeMessage(makeEvent("document.uploaded"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Internal-Secret"]).toBe("test-internal-secret");
  });

  it("includes Content-Type application/json in dispatches", async () => {
    const msg = makeMessage(makeEvent("extraction.completed"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_POLICY.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

// ── queue handler — event body serialization ─────────────────────

describe("svc-queue-router queue handler — event body", () => {
  let worker: { fetch: (req: Request, env: Env) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  it("sends the parsed event as JSON body to target service", async () => {
    const event = makeEvent("document.uploaded");
    const msg = makeMessage(event);
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody["type"]).toBe("document.uploaded");
    expect(sentBody["eventId"]).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect((sentBody["payload"] as Record<string, unknown>)["documentId"]).toBe("doc-1");
  });

  it("sends the parsed event as JSON body to ontology target for policy.approved", async () => {
    const event = makeEvent("policy.approved");
    const msg = makeMessage(event);
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_ONTOLOGY.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody["type"]).toBe("policy.approved");
  });
});

// ── queue handler — invalid/unknown events ───────────────────────

describe("svc-queue-router queue handler — invalid events", () => {
  let worker: { fetch: (req: Request, env: Env) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  it("acks and skips messages with invalid event body", async () => {
    const msg = makeMessage({ invalid: "data" });
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    // Message should be acked (not retried)
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();

    // No service binding should have been called
    for (const svc of [
      env.SVC_INGESTION,
      env.SVC_EXTRACTION,
      env.SVC_POLICY,
      env.SVC_ONTOLOGY,
      env.SVC_SKILL,
    ]) {
      expect((svc.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    }
  });

  it("acks and skips messages with unknown event type", async () => {
    const msg = makeMessage({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-01-15T10:00:00.000Z",
      type: "unknown.event.type",
      payload: { foo: "bar" },
    });
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("acks and skips messages with null body", async () => {
    const msg = makeMessage(null);
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("acks and skips messages with missing required fields", async () => {
    const msg = makeMessage({
      type: "document.uploaded",
      // missing eventId, occurredAt, payload
    });
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("acks and skips messages with missing payload fields", async () => {
    const msg = makeMessage({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-01-15T10:00:00.000Z",
      type: "document.uploaded",
      payload: {
        documentId: "doc-1",
        // missing other required fields
      },
    });
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });
});

// ── queue handler — error handling ───────────────────────────────

describe("svc-queue-router queue handler — error handling", () => {
  let worker: { fetch: (req: Request, env: Env) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  it("retries message when target service returns error status", async () => {
    // Target returns 500
    (env.SVC_INGESTION as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch =
      vi.fn().mockResolvedValue(new Response("Internal Server Error", { status: 500 }));

    const msg = makeMessage(makeEvent("document.uploaded"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    // Message is retried because dispatch failed (await-then-ack pattern)
    expect(msg.retry).toHaveBeenCalledOnce();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it("logs error when target service returns non-ok status", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (env.SVC_EXTRACTION as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch =
      vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    const msg = makeMessage(makeEvent("ingestion.completed"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    // The logger outputs JSON to console.error for "error" level
    expect(consoleSpy).toHaveBeenCalled();
    const errorCalls = consoleSpy.mock.calls;
    const hasDispatchError = errorCalls.some((call) => {
      const line = String(call[0]);
      return line.includes("Dispatch") && (line.includes("failed") || line.includes("error"));
    });
    expect(hasDispatchError).toBe(true);

    consoleSpy.mockRestore();
  });

  it("awaits dispatch completion before acking message", async () => {
    const msg = makeMessage(makeEvent("document.uploaded"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    // Message should be acked (dispatch succeeded)
    expect(msg.ack).toHaveBeenCalledOnce();
    // ctx.waitUntil should NOT be used for dispatches (await pattern instead)
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
});

// ── queue handler — batch processing ─────────────────────────────

describe("svc-queue-router queue handler — batch processing", () => {
  let worker: { fetch: (req: Request, env: Env) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  it("processes multiple messages in a single batch", async () => {
    const msg1 = makeMessage(makeEvent("document.uploaded"), "msg-1");
    const msg2 = makeMessage(makeEvent("ingestion.completed"), "msg-2");
    const msg3 = makeMessage(makeEvent("extraction.completed"), "msg-3");
    const batch = makeBatch([msg1, msg2, msg3]);

    await worker.queue(batch, env, ctx);

    // All three messages should be acked
    expect(msg1.ack).toHaveBeenCalledOnce();
    expect(msg2.ack).toHaveBeenCalledOnce();
    expect(msg3.ack).toHaveBeenCalledOnce();

    // Each routes to its primary target only
    expect((env.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((env.SVC_EXTRACTION.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((env.SVC_POLICY.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });

  it("continues processing valid messages after an invalid one", async () => {
    const invalidMsg = makeMessage({ bad: "data" }, "msg-invalid");
    const validMsg = makeMessage(makeEvent("ontology.normalized"), "msg-valid");
    const batch = makeBatch([invalidMsg, validMsg]);

    await worker.queue(batch, env, ctx);

    // Invalid is acked (skipped), valid is acked (processed)
    expect(invalidMsg.ack).toHaveBeenCalledOnce();
    expect(validMsg.ack).toHaveBeenCalledOnce();

    // ontology.normalized routes to SVC_SKILL
    expect((env.SVC_SKILL.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });

  it("processes batch with all 7 event types", async () => {
    const eventTypes = [
      "document.uploaded",
      "ingestion.completed",
      "extraction.completed",
      "policy.candidate_ready",
      "policy.approved",
      "ontology.normalized",
      "skill.packaged",
    ] as const;

    const messages = eventTypes.map((type, i) =>
      makeMessage(makeEvent(type), `msg-${i}`),
    );
    const batch = makeBatch(messages);

    await worker.queue(batch, env, ctx);

    // All 7 messages should be acked
    for (const msg of messages) {
      expect(msg.ack).toHaveBeenCalledOnce();
    }

    // Domain pipeline targets should have been called
    expect((env.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((env.SVC_EXTRACTION.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((env.SVC_POLICY.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((env.SVC_ONTOLOGY.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((env.SVC_SKILL.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    // policy.candidate_ready and skill.packaged have no targets (platform services removed)
  });

  it("handles empty batch gracefully", async () => {
    const batch = makeBatch([]);

    await worker.queue(batch, env, ctx);

    // No services should have been called
    for (const svc of [
      env.SVC_INGESTION,
      env.SVC_EXTRACTION,
      env.SVC_POLICY,
      env.SVC_ONTOLOGY,
      env.SVC_SKILL,
    ]) {
      expect((svc.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    }
  });
});

// ── queue handler — fan-out target count ─────────────────────────

describe("svc-queue-router queue handler — fan-out target count", () => {
  let worker: { fetch: (req: Request, env: Env) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  type ServiceBinding = "SVC_INGESTION" | "SVC_EXTRACTION" | "SVC_POLICY" | "SVC_ONTOLOGY" | "SVC_SKILL";
  const eventTargetMap: Array<{ type: string; expectedTargets: number; primaryBinding?: ServiceBinding }> = [
    { type: "document.uploaded", expectedTargets: 1, primaryBinding: "SVC_INGESTION" },
    { type: "ingestion.completed", expectedTargets: 1, primaryBinding: "SVC_EXTRACTION" },
    { type: "extraction.completed", expectedTargets: 1, primaryBinding: "SVC_POLICY" },
    { type: "policy.candidate_ready", expectedTargets: 0 },
    { type: "policy.approved", expectedTargets: 1, primaryBinding: "SVC_ONTOLOGY" },
    { type: "ontology.normalized", expectedTargets: 1, primaryBinding: "SVC_SKILL" },
    { type: "skill.packaged", expectedTargets: 0 },
  ];

  for (const { type, expectedTargets, primaryBinding } of eventTargetMap) {
    it(`dispatches ${type} to exactly ${expectedTargets} target(s)`, async () => {
      const msg = makeMessage(makeEvent(type));
      const batch = makeBatch([msg]);

      await worker.queue(batch, env, ctx);

      // Count total fetch calls across ALL service bindings
      let totalCalls = 0;
      for (const key of [
        "SVC_INGESTION",
        "SVC_EXTRACTION",
        "SVC_POLICY",
        "SVC_ONTOLOGY",
        "SVC_SKILL",
      ] as const) {
        totalCalls += (env[key].fetch as ReturnType<typeof vi.fn>).mock.calls.length;
      }

      expect(totalCalls).toBe(expectedTargets);

      if (primaryBinding) {
        expect((env[primaryBinding].fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
      }
    });
  }
});

// ── queue handler — dispatch URL ─────────────────────────────────

describe("svc-queue-router queue handler — dispatch endpoint", () => {
  let worker: { fetch: (req: Request, env: Env) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  it("dispatches to http://internal/internal/queue-event endpoint", async () => {
    const msg = makeMessage(makeEvent("ontology.normalized"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_SKILL.fetch as ReturnType<typeof vi.fn>;
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://internal/internal/queue-event");
  });

  it("uses POST method for all dispatches", async () => {
    const msg = makeMessage(makeEvent("document.uploaded"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
  });
});
