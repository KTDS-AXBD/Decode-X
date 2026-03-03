/**
 * Constant-time string comparison for secret validation.
 * Prevents timing side-channel attacks on inter-service authentication.
 */

const encoder = new TextEncoder();

/**
 * Compare two strings in constant time.
 * Uses crypto.subtle.timingSafeEqual (Cloudflare Workers) when available,
 * falls back to byte-by-byte XOR comparison for other runtimes (Bun tests).
 * Returns false if either string is empty or if they differ.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;

  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  // Prefer native constant-time comparison (Cloudflare Workers runtime)
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    if (aBytes.byteLength !== bBytes.byteLength) {
      crypto.subtle.timingSafeEqual(aBytes, aBytes);
      return false;
    }
    return crypto.subtle.timingSafeEqual(aBytes, bBytes);
  }

  // Fallback: XOR-based constant-time comparison
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  let result = 0;
  for (let i = 0; i < aBytes.byteLength; i++) {
    result |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return result === 0;
}

/**
 * Verify the X-Internal-Secret header against the expected secret.
 * Returns true if authenticated, false otherwise.
 */
export function verifyInternalSecret(
  request: Request,
  expectedSecret: string,
): boolean {
  const secret = request.headers.get("X-Internal-Secret");
  if (!secret) return false;
  return timingSafeCompare(secret, expectedSecret);
}
