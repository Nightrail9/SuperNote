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
// Progress Weights for Pipeline Stages
// ============================================================================

export const PROGRESS_WEIGHTS = {
  /** Video parsing stage */
  PARSE: 0.05,
  /** Audio download stage */
  DOWNLOAD: 0.18,
  /** Frame extraction stage */
  EXTRACT_FRAMES: 0.38,
  /** Transcription stage */
  TRANSCRIBE: 0.68,
  /** Note generation stage */
  GENERATE: 0.88,
  /** Complete */
  COMPLETE: 1.0,
} as const;

// ============================================================================
// Validation Limits
// ============================================================================

export const LIMITS = {
  /** Video understanding max frames */
  MAX_FRAMES: { min: 4, max: 120 },
  /** Scene detection threshold */
  SCENE_THRESHOLD: { min: 0.05, max: 0.95 },
  /** Minimum segment duration in seconds */
  MIN_SEGMENT_SECONDS: { min: 3, max: 60 },
  /** Maximum segments per video */
  MAX_SEGMENTS: { min: 1, max: 100 },
  /** Transcription timeout in minutes */
  TRANSCRIBE_TIMEOUT_MIN: { min: 1, max: 60 },
} as const;

// ============================================================================
// URL Patterns
// ============================================================================

/** Bilibili video URL pattern */
export const BILIBILI_URL_PATTERN =
  /^https?:\/\/(?:(?:www\.|m\.)?bilibili\.com\/video\/(?:BV[a-zA-Z0-9]+|av\d+)|b23\.tv\/[a-zA-Z0-9]+)/i;

/** YouTube video URL pattern */
export const YOUTUBE_URL_PATTERN =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+)/i;

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

// ============================================================================
// File Paths
// ============================================================================

export const PATHS = {
  /** Storage directory for app data */
  STORAGE_DIR: 'storage',
  /** Data subdirectory */
  DATA_DIR: 'storage/data',
  /** App data file */
  APP_DATA_FILE: 'storage/data/app-data.json',
  /** FFmpeg tools directory */
  FFMPEG_DIR: 'tools/ffmpeg',
  /** FFmpeg binary */
  FFMPEG_BIN: 'tools/ffmpeg/bin/ffmpeg.exe',
  /** FFprobe binary */
  FFPROBE_BIN: 'tools/ffmpeg/bin/ffprobe.exe',
} as const;

// ============================================================================
// Content Limits
// ============================================================================

export const CONTENT_LIMITS = {
  /** Maximum web page content length */
  MAX_WEB_CONTENT_LENGTH: 500000, // 500KB
  /** Maximum note title length */
  MAX_TITLE_LENGTH: 200,
  /** Maximum note content length */
  MAX_CONTENT_LENGTH: 100000,
  /** Maximum tags per note */
  MAX_TAGS: 10,
} as const;
