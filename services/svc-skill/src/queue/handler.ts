/**
 * Queue consumer — listens for ontology.normalized events
 * and triggers skill packaging.
 */

import { PipelineEventSchema } from "@ai-foundry/types";
import { createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-skill:queue");

export async function handleQueueBatch(
  batch: MessageBatch,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  for (const message of batch.messages) {
    const parsed = PipelineEventSchema.safeParse(message.body);
    if (!parsed.success) {
      logger.warn("Invalid pipeline event, skipping", {
        error: parsed.error.message,
      });
      message.ack();
      continue;
    }

    const event = parsed.data;
    if (event.type !== "ontology.normalized") {
      message.ack();
      continue;
    }

    logger.info("Received ontology.normalized event", {
      policyId: event.payload.policyId,
      ontologyId: event.payload.ontologyId,
      termCount: event.payload.termCount,
    });

    // TODO: Full integration — fetch confirmed policies from svc-policy
    // and call handleCreateSkill internally. Requires svc-policy
    // GET /policies?policyId=:id endpoint to retrieve structured Policy objects.
    // For now, log and ack.

    message.ack();
  }
}
