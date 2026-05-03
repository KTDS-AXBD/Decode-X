import { describe, it, expect, vi } from "vitest";
import {
  insertBatch,
  getBatch,
  updateBatchProgress,
  insertScores,
  getLatestEvaluation,
} from "./repository.js";
import type { Env } from "../env.js";
import type { AIReadyEvaluation } from "@ai-foundry/types";

// ── Mock helpers ────────────────────────────────────────────────────

function mockDb(firstResult?: unknown, allResults?: unknown[]) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(firstResult ?? null),
        all: vi.fn().mockResolvedValue({ results: allResults ?? [] }),
      }),
    }),
  } as unknown as D1Database;
}

function makeEnv(db: D1Database): Partial<Env> {
  return { DB_SKILL: db };
}

const sampleEvaluation: AIReadyEvaluation = {
  skillId: "lpon-charge",
  skillName: "lpon-charge",
  criteria: [
    { criterion: "source_consistency", score: 0.9, rationale: "Strong BL mapping alignment with complete condition-criteria-outcome triples verified.", passed: true, passThreshold: 0.6 },
    { criterion: "comment_doc_alignment", score: 0.85, rationale: "All runbooks correspond to rule entries with consistent outcome descriptions.", passed: true, passThreshold: 0.6 },
    { criterion: "io_structure", score: 0.8, rationale: "Given/then fields clearly specify types and business meanings for all scenarios.", passed: true, passThreshold: 0.6 },
    { criterion: "exception_handling", score: 0.78, rationale: "Main exception cases covered, minor gap in one edge scenario identified.", passed: true, passThreshold: 0.6 },
    { criterion: "srp_reusability", score: 0.88, rationale: "Each rule maintains single responsibility with no redundant condition overlaps.", passed: true, passThreshold: 0.6 },
    { criterion: "testability", score: 0.82, rationale: "Happy path and error cases covered with concrete given/when/then values.", passed: true, passThreshold: 0.6 },
  ],
  totalScore: 0.838,
  passCount: 6,
  overallPassed: true,
  modelVersion: "anthropic/claude-haiku-4-5",
  evaluatedAt: "2026-04-24T10:00:00.000Z",
  costUsd: 0.0036,
};

// ── Tests ──────────────────────────────────────────────────────────

describe("insertBatch", () => {
  it("returns a batchId string after insertion", async () => {
    const db = mockDb();
    const env = makeEnv(db) as Env;

    const batchId = await insertBatch(env, {
      organizationId: "LPON",
      model: "haiku",
      totalSkills: 859,
    });

    expect(typeof batchId).toBe("string");
    expect(batchId.length).toBeGreaterThan(0);
    expect(db.prepare).toHaveBeenCalled();
  });
});

describe("getBatch", () => {
  it("returns batch row when found", async () => {
    const batchRow = {
      batch_id: "b-001",
      organization_id: "LPON",
      model: "haiku",
      parent_batch_id: null,
      status: "queued",
      total_skills: 859,
      completed_skills: 0,
      failed_skills: 0,
      total_cost_usd: 0,
      started_at: "2026-04-24T10:00:00.000Z",
      completed_at: null,
      metadata_json: null,
    };
    const env = makeEnv(mockDb(batchRow)) as Env;
    const result = await getBatch(env, "b-001");
    expect(result?.batch_id).toBe("b-001");
    expect(result?.status).toBe("queued");
  });

  it("returns null when batch not found", async () => {
    const env = makeEnv(mockDb(null)) as Env;
    const result = await getBatch(env, "nonexistent");
    expect(result).toBeNull();
  });
});

describe("updateBatchProgress", () => {
  it("calls DB update with correct delta and returns updated row", async () => {
    const updatedRow = {
      batch_id: "b-001",
      organization_id: "LPON",
      model: "haiku",
      parent_batch_id: null,
      status: "running",
      total_skills: 3,
      completed_skills: 1,
      failed_skills: 0,
      total_cost_usd: 0.023,
      started_at: "2026-04-24T10:00:00.000Z",
      completed_at: null,
      metadata_json: null,
    };
    const db = mockDb(updatedRow);
    const env = makeEnv(db) as Env;

    const result = await updateBatchProgress(env, "b-001", { completed: 1, costUsd: 0.023 });
    expect(db.prepare).toHaveBeenCalled();
    expect(result?.completed_skills).toBe(1);
  });
});

describe("insertScores", () => {
  it("inserts one row per criterion (6 total)", async () => {
    const db = mockDb();
    const env = makeEnv(db) as Env;

    await insertScores(env, sampleEvaluation, "lpon-charge", "LPON", "b-001", "haiku");

    // 6 criteria + 6 individual prepare calls
    expect(db.prepare).toHaveBeenCalledTimes(6);
  });
});

describe("getLatestEvaluation", () => {
  it("returns null when fewer than 6 rows found", async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [{ id: "1" }, { id: "2" }] }),
        }),
      }),
    } as unknown as D1Database;
    const env = makeEnv(db) as Env;

    const result = await getLatestEvaluation(env, "lpon-charge", "haiku");
    expect(result).toBeNull();
  });
});
