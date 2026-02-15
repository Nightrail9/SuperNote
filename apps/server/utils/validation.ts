/**
 * Validation Utilities
 *
 * Common validation and parsing functions used across the server.
 */

/**
 * Parse a value as a positive integer with fallback
 * @param value - The value to parse
 * @param fallback - The fallback value if parsing fails
 * @returns The parsed positive integer or the fallback value
 *
 * @example
 * parsePositiveInt('42', 1); // returns 42
 * parsePositiveInt('-5', 10); // returns 10
 * parsePositiveInt(null, 5); // returns 5
 */
export function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
