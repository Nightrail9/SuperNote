/**
 * URL Helper Utilities
 *
 * Common URL normalization and validation functions used across the server.
 */

/**
 * Normalize a base URL by trimming whitespace and removing trailing slashes
 */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * Check if URL is a Gemini native API endpoint
 */
export function isGeminiNativeUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname.includes('generativelanguage.googleapis.com');
  } catch {
    return false;
  }
}

/**
 * Strip API path suffixes from a base URL
 */
export function stripApiPath(baseUrl: string): string {
  return normalizeBaseUrl(baseUrl).replace(/\/(chat\/completions|completions|responses)$/i, '');
}
