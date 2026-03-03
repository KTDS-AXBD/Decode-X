/**
 * Format a duration in milliseconds to a human-readable "Xm Ys" string.
 *
 * Examples:
 *   formatDuration(0)       → "0s"
 *   formatDuration(1500)    → "1s"
 *   formatDuration(61_000)  → "1m 1s"
 *   formatDuration(120_000) → "2m 0s"
 *   formatDuration(500)     → "0s"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) {
    return "0s";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}
