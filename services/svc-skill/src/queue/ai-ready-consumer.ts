/**
 * AI-Ready Queue consumer — processes one skill per message.
 * max_concurrency=10 in wrangler.toml allows 30-min full-batch completion.
 *
 * Message body: { batchId, skillId, organizationId, model }
 * On success: inserts 6 criterion scores + updates batch progress.
 * On final failure (attempts >= 3): increments failed_skills + records DLQ message.
 */

import { createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { loadSpecContent, runSixCriteriaEvaluation } from "../ai-ready/evaluator.js";
import {
  insertScores,
  updateBatchProgress,
  getBatch,
  insertBatch,
} from "../ai-ready/repository.js";

const logger = createLogger("svc-skill:ai-ready:consumer");

export interface AIReadyQueueMessage {
  batchId: string;
  skillId: string;
  organizationId: string;
  model: "haiku" | "opus" | "sonnet";
  crossCheckSampleSize?: number;
}

interface DlqEntry {
  batchId: string;
  skillId: string;
  organizationId: string;
  error: string;
  attempts: number;
  failedAt: string;
}

async function recordDlq(env: Env, entry: DlqEntry): Promise<void> {
  try {
    await env.AI_READY_DLQ.send(entry);
  } catch (e) {
    logger.error("DLQ send failed", { ...entry, dlqError: String(e) });
  }
}

async function maybeTriggerCrossCheck(
  env: Env,
  batchId: string,
  organizationId: string,
  crossCheckSampleSize: number,
): Promise<void> {
  if (crossCheckSampleSize <= 0) return;

  const batch = await getBatch(env, batchId);
  if (!batch || batch.status !== "completed") return;

  // Sample random skillIds from completed batch scores
  const sampleResult = await env.DB_SKILL.prepare(
    `SELECT DISTINCT skill_id FROM ai_ready_scores
     WHERE batch_id = ? ORDER BY RANDOM() LIMIT ?`,
  )
    .bind(batchId, crossCheckSampleSize)
    .all<{ skill_id: string }>();

  const sampleSkills = sampleResult.results ?? [];
  if (sampleSkills.length === 0) return;

  const childBatchId = await insertBatch(env, {
    organizationId,
    model: "opus",
    totalSkills: sampleSkills.length,
    parentBatchId: batchId,
    metadataJson: JSON.stringify({ crossCheck: true, parentBatchId: batchId }),
  });

  await Promise.all(
    sampleSkills.map((s) =>
      env.AI_READY_QUEUE.send({
        batchId: childBatchId,
        skillId: s.skill_id,
        organizationId,
        model: "opus",
        crossCheckSampleSize: 0,
      }),
    ),
  );

  logger.info("Cross-check batch created", {
    parentBatchId: batchId,
    childBatchId,
    sampleSize: sampleSkills.length,
  });
}

export async function handleAIReadyMessage(
  messages: readonly MessageBatch<AIReadyQueueMessage>["messages"][number][],
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  for (const msg of messages) {
    const { batchId, skillId, organizationId, model, crossCheckSampleSize = 0 } = msg.body;

    try {
      const loaded = await loadSpecContent(env, skillId, organizationId);
      if (!loaded) {
        logger.warn("spec-container not found — skipping", { skillId, organizationId });
        await updateBatchProgress(env, batchId, { failed: 1 });
        msg.ack();
        continue;
      }

      const evaluation = await runSixCriteriaEvaluation(
        env,
        loaded.specContent,
        loaded.skillName,
        model,
      );

      await insertScores(env, evaluation, skillId, organizationId, batchId, model);
      const updatedBatch = await updateBatchProgress(env, batchId, {
        completed: 1,
        costUsd: evaluation.costUsd,
      });

      // If this message completes the batch and cross-check is configured
      if (updatedBatch?.status === "completed") {
        await maybeTriggerCrossCheck(env, batchId, organizationId, crossCheckSampleSize);
      }

      msg.ack();
    } catch (e) {
      logger.error("AI-Ready evaluation failed", {
        batchId, skillId, model, error: String(e), attempts: msg.attempts,
      });

      if (msg.attempts >= 3) {
        await updateBatchProgress(env, batchId, { failed: 1 });
        await recordDlq(env, {
          batchId, skillId, organizationId,
          error: String(e),
          attempts: msg.attempts,
          failedAt: new Date().toISOString(),
        });
        msg.ack();
      } else {
        msg.retry({ delaySeconds: 5 * msg.attempts });
      }
    }
  }
}
