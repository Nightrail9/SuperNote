/**
 * Core type definitions for Bilibili Video Parser
 *
 * This file contains all interfaces and types used throughout the parser.
 * Implements Requirements: 5.1, 5.2, 5.3, 6.3
 */

// ============================================================================
// Video Identifier Types
// ============================================================================

/**
 * Video identifier extracted from URL
 */
export interface VideoIdentifier {
  bvid?: string;      // BV 号，如 "BV1xx411c7mD"
  aid?: number;       // av 号，如 170001
  part: number;       // 分P索引，默认 1
}

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Video metadata from Bilibili API
 */
export interface VideoMetadata {
  bvid: string;
  aid: number;
  cid: number;           // 当前分P的 cid
  title: string;
  pages: PageInfo[];     // 所有分P信息
  duration: number;      // 视频时长（秒）
}

/**
 * Information about a single video part (分P)
 */
export interface PageInfo {
  cid: number;
  part: string;          // 分P标题
  page: number;          // 分P索引
  duration: number;
}

// ============================================================================
// Stream Types (Requirements 5.1, 5.2, 5.3)
// ============================================================================

/**
 * Stream information from PlayURL API
 */
export interface StreamInfo {
  format: 'dash' | 'flv' | 'mp4';
  quality: number;
  dash?: DashInfo;
  durl?: DurlInfo[];
  acceptQuality: QualityOption[];
}

/**
 * DASH format stream information (Requirement 5.1)
 * Contains separate video and audio streams
 */
export interface DashInfo {
  video: DashStream[];
  audio: DashStream[];
}

/**
 * Individual DASH stream with quality information (Requirement 5.3)
 */
export interface DashStream {
  id: number;            // 清晰度 ID
  baseUrl: string;       // 流地址
  backupUrl: string[];   // 备用地址
  bandwidth: number;     // 带宽
  codecs: string;        // 编码格式
  width?: number;
  height?: number;
}

/**
 * FLV/MP4 format stream information (Requirement 5.2)
 */
export interface DurlInfo {
  url: string;
  backupUrl: string[];
  size: number;
  length: number;        // 时长（毫秒）
}

/**
 * Quality option descriptor
 */
export interface QualityOption {
  quality: number;
  description: string;
}

// ============================================================================
// Parse Result Types
// ============================================================================

/**
 * Main parse result type
 */
export interface ParseResult {
  success: boolean;
  data?: ParsedVideo;
  error?: ParseError;
}

/**
 * Parsed video with all stream options
 */
export interface ParsedVideo {
  title: string;
  bvid: string;
  aid: number;
  cid: number;
  part: number;
  duration: number;
  streams: StreamOption[];
}

/**
 * Individual stream option with quality and format info
 */
export interface StreamOption {
  quality: number;
  qualityDescription: string;
  format: 'dash' | 'flv' | 'mp4';
  video?: {
    url: string;
    backupUrls: string[];
    codecs: string;
    width: number;
    height: number;
    bandwidth: number;
  };
  audio?: {
    url: string;
    backupUrls: string[];
    codecs: string;
    bandwidth: number;
  };
  url?: string;          // FLV/MP4 直接播放地址
}

// ============================================================================
// Error Types (Requirement 6.3)
// ============================================================================

/**
 * Parse error with stage identification (Requirement 6.3)
 * Indicates which step in the pipeline failed
 */
export interface ParseError {
  stage: 'normalize' | 'extract' | 'metadata' | 'playurl' | 'synthesize';
  code: string;
  message: string;
}

/**
 * Normalize error codes
 */
export interface NormalizeError {
  code: 'INVALID_URL' | 'REDIRECT_FAILED' | 'NOT_BILIBILI_URL';
  message: string;
  httpStatus?: number;
}

/**
 * Extract error codes
 */
export interface ExtractError {
  code: 'NO_VIDEO_ID' | 'INVALID_FORMAT';
  message: string;
}

/**
 * API error from Bilibili
 */
export interface APIError {
  code: number;          // Bilibili API 错误码
  message: string;
  httpStatus?: number;
}

/**
 * Union type for all parser errors
 */
export type ParserError =
  | { type: 'INVALID_URL'; message: string }
  | { type: 'REDIRECT_FAILED'; httpStatus: number; message: string }
  | { type: 'NO_VIDEO_ID'; message: string }
  | { type: 'API_ERROR'; code: number; message: string }
  | { type: 'VIDEO_NOT_FOUND'; message: string }
  | { type: 'RATE_LIMITED'; message: string }
  | { type: 'FORBIDDEN'; message: string }
  | { type: 'NETWORK_ERROR'; message: string };

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Parser configuration
 */
export interface Config {
  sessdata?: string;           // 登录凭证
  userAgent: string;           // User-Agent
  referer: string;             // Referer
  timeout: number;             // 请求超时（毫秒）
  retryAttempts: number;       // 重试次数
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Config = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  referer: 'https://www.bilibili.com',
  timeout: 10000,
  retryAttempts: 3
};

// ============================================================================
// Result Types for Individual Components
// ============================================================================

/**
 * Result from URL normalization
 */
export interface NormalizeResult {
  success: boolean;
  url?: string;
  error?: NormalizeError;
}

/**
 * Result from ID extraction
 */
export interface ExtractResult {
  success: boolean;
  data?: VideoIdentifier;
  error?: ExtractError;
}

/**
 * Result from metadata fetching
 */
export interface MetadataResult {
  success: boolean;
  data?: VideoMetadata;
  error?: APIError;
}

/**
 * Parameters for PlayURL API
 */
export interface PlayURLParams {
  bvid: string;
  cid: number;
  qn?: number;           // 清晰度，默认 127
  fnval?: number;        // 格式标志，默认 4048 (DASH)
  fourk?: number;        // 是否请求 4K，默认 1
}

/**
 * Result from PlayURL fetching
 */
export interface PlayURLResult {
  success: boolean;
  data?: StreamInfo;
  error?: APIError;
}

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Retry configuration for HTTP requests
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;      // 毫秒
  maxDelay: number;       // 毫秒
  retryableErrors: string[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableErrors: ['NETWORK_ERROR', 'RATE_LIMITED']
};

// ============================================================================
// Full Parse Result (Extended Output Model)
// ============================================================================

/**
 * Complete parse result with all metadata
 */
export interface FullParseResult {
  // 视频基本信息
  video: {
    bvid: string;
    aid: number;
    title: string;
    duration: number;
  };

  // 当前分P信息
  currentPart: {
    index: number;
    cid: number;
    title: string;
  };

  // 所有分P列表
  parts: PageInfo[];

  // 可用流列表
  streams: StreamOption[];

  // 元信息
  meta: {
    parsedAt: string;      // ISO 时间戳
    expiresAt?: string;    // 流地址过期时间
  };
}

// ============================================================================
// Supported URL Types
// ============================================================================

/**
 * Supported URL format patterns
 */
export type SupportedURL =
  | `https://b23.tv/${string}`
  | `https://www.bilibili.com/video/BV${string}`
  | `https://www.bilibili.com/video/av${string}`
  | `https://bilibili.com/video/${string}`;
