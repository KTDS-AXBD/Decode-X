/**
 * Queue consumer — listens for policy.approved events
 * and bootstraps ontology normalization records.
 */

import { PipelineEventSchema } from "@ai-foundry/types";
import type { OntologyNormalizedEvent } from "@ai-foundry/types";
import { createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-ontology:queue");

export async function handleQueueBatch(
  batch: MessageBatch,
  env: Env,
  ctx: ExecutionContext,
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
    if (event.type !== "policy.approved") {
      message.ack();
      continue;
    }

    const { policyId, policyCount } = event.payload;
    logger.info("Received policy.approved event", { policyId, policyCount });

    // Bootstrap an ontology record for this approved policy batch.
    // Detailed term normalization is triggered via POST /normalize once
    // policy terms are available from the upstream extraction pipeline.
    const now = new Date().toISOString();
    const ontologyId = crypto.randomUUID();
    const skosConceptScheme = `urn:aif:scheme:${ontologyId}`;

    ctx.waitUntil(
      (async () => {
        try {
          await env.DB_ONTOLOGY.prepare(
            `INSERT INTO ontologies (
              ontology_id, policy_id, organization_id, neo4j_graph_id,
              skos_concept_scheme, term_count, status, created_at, completed_at
            ) VALUES (?, ?, ?, NULL, ?, 0, 'pending', ?, NULL)`,
          )
            .bind(ontologyId, policyId, "system", skosConceptScheme, now)
            .run();

          // Emit ontology.normalized so downstream svc-skill can begin
          const outEvent: OntologyNormalizedEvent = {
            eventId: crypto.randomUUID(),
            occurredAt: now,
            type: "ontology.normalized",
            payload: {
              policyId,
              ontologyId,
              termCount: 0,
            },
          };
          await env.QUEUE_PIPELINE.send(outEvent);

          logger.info("Bootstrapped ontology record", { ontologyId, policyId });
        } catch (e) {
          logger.error("Failed to bootstrap ontology for policy.approved event", {
            policyId,
            error: String(e),
          });
        }
      })(),
    );

    message.ack();
  }
}
