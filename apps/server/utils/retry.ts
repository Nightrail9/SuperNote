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
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000, onRetry } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries || !isRetryableError(lastError)) {
        throw lastError;
      }

      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs
      );
      await sleep(delay);
    }
  }

  throw lastError!;
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
