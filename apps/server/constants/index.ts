/**
 * Application Constants
 *
 * Centralized constants for timeouts, limits, and configuration values.
 */

// ============================================================================
// Timeouts
// ============================================================================

export const TIMEOUTS = {
  /** Model detection timeout */
  MODEL_DETECT_MS: 12000,
  /** Minimum transcribe timeout */
  TRANSCRIBE_MIN_MS: 30000,
  /** Maximum transcribe timeout */
  TRANSCRIBE_MAX_MS: 1800000, // 30 minutes
  /** Minimum keyframe extraction timeout */
  KEYFRAME_MIN_MS: 15000,
  /** Maximum keyframe extraction timeout */
  KEYFRAME_MAX_MS: 600000, // 10 minutes
  /** Default fetch timeout */
  FETCH_DEFAULT_MS: 30000,
  /** LLM generation timeout */
  GENERATION_MS: 120000,
  /** Screenshot timeout */
  SCREENSHOT_MS: 60000,
} as const;

// ============================================================================
// URL Patterns
// ============================================================================

/** Bilibili video URL pattern */
export const BILIBILI_URL_PATTERN =
  /^https?:\/\/(?:(?:www\.|m\.)?bilibili\.com\/video\/(?:BV[a-zA-Z0-9]+|av\d+)|b23\.tv\/[a-zA-Z0-9]+)/i;

// ============================================================================
// Retry Configuration
// ============================================================================

export const RETRY_CONFIG = {
  /** Default max retry attempts */
  MAX_RETRIES: 3,
  /** Base delay for exponential backoff (ms) */
  BASE_DELAY_MS: 1000,
  /** Maximum delay between retries (ms) */
  MAX_DELAY_MS: 30000,
} as const;
