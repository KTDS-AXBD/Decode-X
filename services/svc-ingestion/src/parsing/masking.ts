
/**
 * PII masking — stub after svc-security separation.
 * Returns text as-is. External masking service to be provided by AI Foundry portal.
 */
export async function maskText(
  _documentId: string,
  text: string,
): Promise<string> {
  return text;
}
