/**
 * Main Parser for Bilibili Video Parser
 *
 * Combines all components to implement the complete parsing pipeline.
 * Implements Requirements: 6.1, 6.2, 6.3
 */

import { load as loadConfig } from './config.js';
import { extract } from './extractor.js';
import { fetchMetadata } from './metadata-fetcher.js';
import { normalize } from './normalizer.js';
import { fetchPlayUrlWithFallback } from './playurl-fetcher.js';
import { synthesizeStreams } from './synthesizer.js';
import type { Config, ParseResult, ParseError, VideoIdentifier, VideoMetadata, StreamInfo } from './types.js';

/**
 * Error stage type for pipeline errors
 * Requirement 6.3: Error stage identification
 */
export type ErrorStage = 'normalize' | 'extract' | 'metadata' | 'playurl' | 'synthesize';

/**
 * BilibiliParser interface
 * Requirement 6.1: Complete parsing pipeline
 */
export interface BilibiliParser {
  parse(url: string, options?: Partial<Config>): Promise<ParseResult>;
}

/**
 * Create a ParseError with stage identification
 * Requirement 6.3: Error response includes stage name where failure occurred
 *
 * @param stage - The pipeline stage where the error occurred
 * @param code - Error code
 * @param message - Error message
 * @returns ParseError with stage identification
 */
function createParseError(stage: ErrorStage, code: string, message: string): ParseError {
  return {
    stage,
    code,
    message,
  };
}

/**
 * Parse a Bilibili video URL and return stream information
 *
 * Pipeline stages:
 * 1. normalize - Normalize URL (handle short links, validate format)
 * 2. extract - Extract video identifiers (bvid/aid, part index)
 * 3. metadata - Fetch video metadata from Bilibili API
 * 4. playurl - Fetch stream URLs from Bilibili API
 * 5. synthesize - Organize stream information into output format
 *
 * Requirements:
 * - 6.1: Execute complete parsing pipeline and return stream URLs
 * - 6.2: Support short links, standard links, and links with part parameters
 * - 6.3: Return descriptive error indicating which step failed
 *
 * @param url - The Bilibili video URL to parse
 * @param options - Optional configuration overrides
 * @returns ParseResult with stream information or error
 */
export async function parse(url: string, options?: Partial<Config>): Promise<ParseResult> {
  // Load configuration with optional overrides
  const config = loadConfig(options);

  // Stage 1: Normalize URL
  // Requirement 6.2: Support short links, standard links, and links with part parameters
  const normalizeResult = await normalize(url);

  if (!normalizeResult.success) {
    // Requirement 6.3: Error indicates which step failed
    return {
      success: false,
      error: createParseError(
        'normalize',
        normalizeResult.error?.code ?? 'UNKNOWN',
        normalizeResult.error?.message ?? 'URL normalization failed'
      ),
    };
  }

  const normalizedUrl = normalizeResult.url!;

  // Stage 2: Extract video identifiers
  const extractResult = extract(normalizedUrl);

  if (!extractResult.success) {
    return {
      success: false,
      error: createParseError(
        'extract',
        extractResult.error?.code ?? 'UNKNOWN',
        extractResult.error?.message ?? 'ID extraction failed'
      ),
    };
  }

  const videoId: VideoIdentifier = extractResult.data!;

  // Stage 3: Fetch video metadata
  const metadataResult = await fetchMetadata(videoId, config);

  if (!metadataResult.success) {
    return {
      success: false,
      error: createParseError(
        'metadata',
        metadataResult.error?.code?.toString() ?? 'UNKNOWN',
        metadataResult.error?.message ?? 'Metadata fetch failed'
      ),
    };
  }

  const metadata: VideoMetadata = metadataResult.data!;

  // Stage 4: Fetch play URLs
  const playUrlResult = await fetchPlayUrlWithFallback(
    {
      bvid: metadata.bvid,
      cid: metadata.cid,
    },
    config
  );

  if (!playUrlResult.success) {
    return {
      success: false,
      error: createParseError(
        'playurl',
        playUrlResult.error?.code?.toString() ?? 'UNKNOWN',
        playUrlResult.error?.message ?? 'PlayURL fetch failed'
      ),
    };
  }

  const streamInfo: StreamInfo = playUrlResult.data!;

  // Stage 5: Synthesize stream information
  const synthesizeResult = synthesizeStreams(streamInfo, metadata);

  if (!synthesizeResult.success) {
    // synthesizeStreams already returns ParseError with stage
    return synthesizeResult;
  }

  // Requirement 6.1: Return stream URLs
  return synthesizeResult;
}

/**
 * Create a BilibiliParser instance
 * @param defaultConfig - Optional default configuration
 * @returns BilibiliParser implementation
 */
export function createBilibiliParser(defaultConfig?: Partial<Config>): BilibiliParser {
  return {
    parse: (url: string, options?: Partial<Config>) => {
      // Merge default config with options
      const mergedOptions = defaultConfig ? { ...defaultConfig, ...options } : options;
      return parse(url, mergedOptions);
    },
  };
}

// Export default parser factory
export default createBilibiliParser;
