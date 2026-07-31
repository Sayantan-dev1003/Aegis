/**
 * Parses a Go-style duration string (e.g., "30m", "8h", "7d") into milliseconds.
 * Supports: s (seconds), m (minutes), h (hours), d (days).
 */
export function parseDurationMs(duration: string): number {
  const match = duration.trim().match(/^(\d+(\.\d+)?)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration format: "${duration}". Expected e.g. "30m", "8h", "7d".`);
  }
  const value = parseFloat(match[1]);
  const unit = match[3];

  switch (unit) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default:  return value * 60 * 1000;
  }
}
