import { createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

export type UnstructuredElement = {
  type: string;
  text: string;
  metadata?: Record<string, unknown>;
};

export async function parseDocument(
  fileBytes: ArrayBuffer,
  filename: string,
  mimeType: string,
  env: Env,
): Promise<UnstructuredElement[]> {
  if (!env.UNSTRUCTURED_API_KEY) {
    const logger = createLogger("svc-ingestion");
    logger.warn("UNSTRUCTURED_API_KEY not set — skipping document parsing");
    return [];
  }

  const formData = new FormData();
  const blob = new Blob([fileBytes], { type: mimeType });
  formData.append("files", blob, filename);

  const response = await fetch(`${env.UNSTRUCTURED_API_URL}/general/v0/general`, {
    method: "POST",
    headers: {
      "unstructured-api-key": env.UNSTRUCTURED_API_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Unstructured.io error ${response.status}: ${body}`);
  }

  const data = await response.json() as Array<{ type?: string; text?: string; metadata?: Record<string, unknown> }>;

  return data.map((el) => {
    const element: UnstructuredElement = {
      type: el.type ?? "Text",
      text: el.text ?? "",
    };
    if (el.metadata !== undefined) {
      element.metadata = el.metadata;
    }
    return element;
  });
}
