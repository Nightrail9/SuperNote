/**
 * HTTP Client for Bilibili Video Parser
 *
 * HTTP client wrapper with retry logic and header management.
 * Implements Requirements: 3.7, 4.8, 7.3, 7.4
 */

import { Config, RetryConfig, DEFAULT_CONFIG, DEFAULT_RETRY } from './types.js';

/**
 * HTTP request options
 */
export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
}

/**
 * HTTP response wrapper
 */
export interface HttpResponse<T = unknown> {
  success: boolean;
  data?: T;
  status?: number;
  error?: {
    code: string;
    message: string;
    httpStatus?: number;
  };
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelay * Math.pow(2, attempt - 1);
  return Math.min(delay, config.maxDelay);
}

/**
 * Check if error is retryable
 */
function isRetryableError(errorCode: string, config: RetryConfig): boolean {
  return config.retryableErrors.includes(errorCode);
}

/**
 * Build headers for Bilibili API requests
 * Requirements 3.7, 4.8: Set required Referer and User-Agent headers
 */
export function buildHeaders(config: Config): Record<string, string> {
  const headers: Record<string, string> = {
    'Referer': config.referer,
    'User-Agent': config.userAgent,
    'Accept': 'application/json',
  };

  // Add SESSDATA cookie if configured
  if (config.sessdata) {
    headers['Cookie'] = `SESSDATA=${config.sessdata}`;
  }

  return headers;
}

/**
 * Create an AbortController with timeout
 * Requirement 7.3: Configurable request timeout
 */
function createTimeoutController(timeout: number): { controller: AbortController; timeoutId: NodeJS.Timeout } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return { controller, timeoutId };
}

/**
 * Make HTTP request with retry logic
 * Requirements 7.3, 7.4: Configurable timeout and retry attempts
 */
export async function httpRequest<T>(
  url: string,
  config: Config = DEFAULT_CONFIG,
  options: HttpRequestOptions = {}
): Promise<HttpResponse<T>> {
  const retryConfig: RetryConfig = {
    ...DEFAULT_RETRY,
    ...options.retryConfig,
  };

  const timeout = options.timeout ?? config.timeout;
  const method = options.method ?? 'GET';
  const headers = {
    ...buildHeaders(config),
    ...options.headers,
  };

  let lastError: HttpResponse<T> = {
    success: false,
    error: {
      code: 'UNKNOWN_ERROR',
      message: 'Unknown error occurred',
    },
  };

  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      const { controller, timeoutId } = createTimeoutController(timeout);

      const response = await fetch(url, {
        method,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle HTTP errors
      if (!response.ok) {
        const errorCode = mapHttpStatusToErrorCode(response.status);
        lastError = {
          success: false,
          status: response.status,
          error: {
            code: errorCode,
            message: `HTTP ${response.status}: ${response.statusText}`,
            httpStatus: response.status,
          },
        };

        // Check if error is retryable
        if (isRetryableError(errorCode, retryConfig) && attempt < retryConfig.maxAttempts) {
          const delay = calculateDelay(attempt, retryConfig);
          await sleep(delay);
          continue;
        }

        return lastError;
      }

      // Parse JSON response
      const data = await response.json() as T;
      return {
        success: true,
        data,
        status: response.status,
      };

    } catch (error) {
      const errorCode = mapErrorToCode(error);
      lastError = {
        success: false,
        error: {
          code: errorCode,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };

      // Check if error is retryable
      if (isRetryableError(errorCode, retryConfig) && attempt < retryConfig.maxAttempts) {
        const delay = calculateDelay(attempt, retryConfig);
        await sleep(delay);
        continue;
      }

      return lastError;
    }
  }

  return lastError;
}

/**
 * Map HTTP status code to error code
 */
function mapHttpStatusToErrorCode(status: number): string {
  switch (status) {
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 412:
      return 'RATE_LIMITED';
    case 429:
      return 'RATE_LIMITED';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'SERVER_ERROR';
    default:
      return 'HTTP_ERROR';
  }
}

/**
 * Map error to error code
 */
function mapErrorToCode(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'TIMEOUT';
    }
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return 'NETWORK_ERROR';
    }
  }
  return 'NETWORK_ERROR';
}

/**
 * HTTP Client class for more structured usage
 */
export class HttpClient {
  private config: Config;
  private retryConfig: RetryConfig;

  constructor(config: Partial<Config> = {}, retryConfig: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.retryConfig = { ...DEFAULT_RETRY, ...retryConfig };
  }

  /**
   * Make GET request
   */
  async get<T>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    return httpRequest<T>(url, this.config, {
      ...options,
      method: 'GET',
      retryConfig: { ...this.retryConfig, ...options.retryConfig },
    });
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<Config>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Config {
    return { ...this.config };
  }
}

/**
 * Create HTTP client instance
 */
export function createHttpClient(config?: Partial<Config>, retryConfig?: Partial<RetryConfig>): HttpClient {
  return new HttpClient(config, retryConfig);
}
