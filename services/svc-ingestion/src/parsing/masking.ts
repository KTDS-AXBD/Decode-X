import { createLogger } from "@ai-foundry/utils";

const logger = createLogger("svc-ingestion");

type MaskResponse = {
  success: boolean;
  data?: { maskedText: string };
};

export async function maskText(
  documentId: string,
  text: string,
  security: Fetcher,
  internalSecret: string,
): Promise<string> {
  try {
    const response = await security.fetch("https://svc-security.internal/mask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": internalSecret,
      },
      body: JSON.stringify({ documentId, text, dataClassification: "internal" }),
    });

    if (!response.ok) {
      logger.warn("Masking request failed, using original text", {
        documentId,
        status: response.status,
      });
      return text;
    }

    const json = await response.json() as MaskResponse;

    if (!json.success || !json.data) {
      logger.warn("Masking response invalid, using original text", { documentId });
      return text;
    }

    return json.data.maskedText;
  } catch (e) {
    logger.warn("Masking call threw, using original text", {
      documentId,
      error: String(e),
    });
    return text;
  }
}
