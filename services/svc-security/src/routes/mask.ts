import { MaskRequestSchema } from "@ai-foundry/types";
import { ok, badRequest, errFromUnknown, createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { tokenize } from "../masking/tokenizer.js";

export async function handleMask(request: Request, env: Env): Promise<Response> {
  const logger = createLogger("svc-security");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = MaskRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid request", parsed.error.flatten());
  }

  const { documentId, text, dataClassification } = parsed.data;

  try {
    const result = await tokenize(documentId, text, dataClassification, env.DB_SECURITY);

    logger.info("Text masked", {
      documentId,
      tokenCount: result.tokenCount,
      dataClassification,
    });

    return ok(result);
  } catch (e) {
    logger.error("Masking failed", { documentId, error: String(e) });
    return errFromUnknown(e);
  }
}
