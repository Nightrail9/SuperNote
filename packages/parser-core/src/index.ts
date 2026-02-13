/**
 * Bilibili Video Parser
 *
 * Main entry point for the Bilibili video link parser.
 * Converts various Bilibili URL formats to playable stream URLs.
 *
 * Implements Requirement 6.1: Complete parsing pipeline
 *
 * @example
 * ```typescript
 * import { parse, BilibiliParser, createBilibiliParser } from 'bilibili-video-parser';
 *
 * // Simple usage with parse function
 * const result = await parse('https://www.bilibili.com/video/BV1xx411c7mD');
 *
 * // Or create a parser instance with custom config
 * const parser = createBilibiliParser({ timeout: 5000 });
 * const result = await parser.parse('https://b23.tv/xxxxx');
 *
 * // Serialize/deserialize results
 * const json = toJSON(result);
 * const restored = fromJSON(json);
 * ```
 */

// ============================================================================
// Core Types and Interfaces
// ============================================================================

export type {
  // Video Identifier Types
  VideoIdentifier,

  // Metadata Types
  VideoMetadata,
  PageInfo,

  // Stream Types (Requirements 5.1, 5.2, 5.3)
  StreamInfo,
  DashInfo,
  DashStream,
  DurlInfo,
  QualityOption,

  // Parse Result Types
  ParseResult,
  ParsedVideo,
  StreamOption,

  // Error Types (Requirement 6.3)
  ParseError,
  NormalizeError,
  ExtractError,
  APIError,
  ParserError,

  // Configuration Types
  Config,
  RetryConfig,

  // Component Result Types
  NormalizeResult,
  ExtractResult,
  MetadataResult,
  PlayURLParams,
  PlayURLResult,

  // Extended Output Model
  FullParseResult,

  // URL Types
  SupportedURL,
} from './types.js';

// Export default configuration constants
export { DEFAULT_CONFIG, DEFAULT_RETRY } from './types.js';

// ============================================================================
// Configuration Manager
// ============================================================================

export {
  // Functions
  fromEnv,
  load,
  createConfigManager,
  getDefaultConfig,
  // Default instance
  configManager,
  // Types
  type ConfigManager,
} from './config.js';

// ============================================================================
// URL Normalizer (Requirements 1.1, 1.2, 1.3, 1.4, 1.5)
// ============================================================================

export {
  // Main function
  normalize,
  // Utility functions
  isShortLink,
  isBilibiliVideoUrl,
  isBilibiliUrl,
  // Factory function
  createNormalizer,
  // Default instance
  normalizer,
  // Types
  type Normalizer,
} from './normalizer.js';

// ============================================================================
// ID Extractor (Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6)
// ============================================================================

export {
  // Main function
  extract,
  // Factory function
  createIDExtractor,
  // Class implementation
  IDExtractorImpl,
  // Patterns for advanced usage
  patterns,
  // Types
  type IDExtractor,
} from './extractor.js';

// ============================================================================
// Metadata Fetcher (Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7)
// ============================================================================

export {
  // Main function
  fetchMetadata,
  // Utility function
  selectCidForPart,
  // Factory function
  createMetadataFetcher,
  // Types
  type MetadataFetcher,
} from './metadata-fetcher.js';

// ============================================================================
// PlayURL Fetcher (Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8)
// ============================================================================

export {
  // Main functions
  fetchPlayUrl,
  fetchPlayUrlWithFallback,
  // URL builder utility
  buildPlayUrlApiUrl,
  // Factory function
  createPlayUrlFetcher,
  // Constants
  QUALITY_PARAMS,
  FORMAT_FLAGS,
  // Types
  type PlayURLFetcher,
} from './playurl-fetcher.js';

// ============================================================================
// Stream Synthesizer (Requirements 5.1, 5.2, 5.3, 5.4, 5.5)
// ============================================================================

export {
  // Main function
  synthesizeStreams,
  // Utility functions
  synthesizeDashStreams,
  synthesizeFlvStreams,
  sortByQualityDescending,
  getQualityDescription,
  // Factory function
  createStreamSynthesizer,
  // Types
  type StreamSynthesizer,
} from './synthesizer.js';

// ============================================================================
// Main Parser (Requirements 6.1, 6.2, 6.3)
// ============================================================================

export {
  // Main function
  parse,
  // Factory function
  createBilibiliParser,
  // Types
  type BilibiliParser,
  type ErrorStage,
} from './parser.js';

// ============================================================================
// JSON Serialization (Requirements 6.4, 6.5)
// ============================================================================

export {
  // Main functions
  toJSON,
  fromJSON,
  // Default instance
  serializer,
  // Error class
  SerializerError,
  // Types
  type Serializer,
} from './serializer.js';

// ============================================================================
// HTTP Client (Internal, but exported for advanced usage)
// ============================================================================

export {
  createHttpClient,
  httpRequest,
  buildHeaders,
  type HttpClient,
  type HttpResponse,
  type HttpRequestOptions,
} from './http-client.js';
