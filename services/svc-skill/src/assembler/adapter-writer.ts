/**
 * Adapter writer — generates MCP + OpenAPI adapter JSONs from a SkillPackage,
 * stores them in R2, and returns the R2 keys for the adapters field.
 */

import type { SkillPackage } from "@ai-foundry/types";
import { toMcpAdapter } from "../routes/mcp.js";
import { toOpenApiSpec } from "../routes/openapi.js";

export interface AdapterKeys {
  mcp: string;
  openapi: string;
}

/**
 * Generate MCP + OpenAPI adapter JSONs and store in R2.
 * Returns R2 keys to embed in `SkillPackage.adapters`.
 */
export async function generateAndStoreAdapters(
  pkg: SkillPackage,
  r2: R2Bucket,
): Promise<AdapterKeys> {
  const mcpKey = `skill-packages/${pkg.skillId}.mcp.json`;
  const openapiKey = `skill-packages/${pkg.skillId}.openapi.json`;

  const mcpAdapter = toMcpAdapter(pkg);
  const openapiSpec = toOpenApiSpec(pkg);

  await Promise.all([
    r2.put(mcpKey, JSON.stringify(mcpAdapter, null, 2), {
      httpMetadata: { contentType: "application/json" },
    }),
    r2.put(openapiKey, JSON.stringify(openapiSpec, null, 2), {
      httpMetadata: { contentType: "application/json" },
    }),
  ]);

  return { mcp: mcpKey, openapi: openapiKey };
}
