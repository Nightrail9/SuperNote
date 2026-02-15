/**
 * Retry Logic Utilities
 *
 * Common retry patterns for handling transient failures.
 */

/**
 * Check if an error is retryable (network/transient issues)
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('429') ||
    message.includes('rate') ||
    message.includes('etimedout') ||
    message.includes('socket')
  );
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create an abort signal with timeout
 */
export function createAbortSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Clean up timeout if signal is aborted early (Node.js specific)
  if (typeof timeout.unref === 'function') {
    timeout.unref();
  }

  return controller.signal;
}
