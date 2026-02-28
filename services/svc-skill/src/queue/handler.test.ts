import { describe, it, expect } from "vitest";
import { processQueueEvent } from "./handler.js";
import type { Env } from "../env.js";

const dummyEnv = {} as Env;
const dummyCtx = { waitUntil: () => {} } as unknown as ExecutionContext;

describe("processQueueEvent (svc-skill)", () => {
  it("rejects invalid pipeline event", async () => {
    const res = await processQueueEvent({ bad: true }, dummyEnv, dummyCtx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid pipeline event");
  });

  it("ignores non-ontology.normalized events", async () => {
    const event = {
      eventId: "00000000-0000-0000-0000-000000000001",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "policy.approved",
      payload: {
        policyId: "p-1",
        hitlSessionId: "s-1",
        approvedBy: "rev-1",
        approvedAt: "2026-02-28T00:00:00.000Z",
        policyCount: 1,
      },
    };
    const res = await processQueueEvent(event, dummyEnv, dummyCtx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ignored");
  });

  it("processes ontology.normalized event", async () => {
    const event = {
      eventId: "00000000-0000-0000-0000-000000000002",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "ontology.normalized",
      payload: {
        policyId: "p-1",
        ontologyId: "ont-1",
        termCount: 5,
      },
    };
    const res = await processQueueEvent(event, dummyEnv, dummyCtx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; policyId: string };
    expect(body.status).toBe("processed");
    expect(body.policyId).toBe("p-1");
  });

  it("rejects malformed event schema", async () => {
    const event = {
      eventId: "bad",
      occurredAt: "not-a-date",
      type: "ontology.normalized",
      payload: {},
    };
    const res = await processQueueEvent(event, dummyEnv, dummyCtx);
    expect(res.status).toBe(400);
  });
});
