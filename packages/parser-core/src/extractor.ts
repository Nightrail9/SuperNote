/**
 * ID Extractor
 *
 * Extracts video identifiers (bvid/aid) and part index from normalized URLs.
 * Implements Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import { ExtractResult, ExtractError, VideoIdentifier } from './types.js';

/**
 * Regular expression patterns for ID extraction
 * 
 * BV 号: /BV[a-zA-Z0-9]+/
 * av 号: /av(\d+)/i 或 /aid=(\d+)/
 * 分P: /[?&]p=(\d+)/
 */
const BVID_PATTERN = /BV[a-zA-Z0-9]+/;
const AID_URL_PATTERN = /\/av(\d+)/i;
const AID_QUERY_PATTERN = /[?&]aid=(\d+)/;
const PART_PATTERN = /[?&]p=(\d+)/;

/**
 * ID Extractor interface
 */
export interface IDExtractor {
  extract(url: string): ExtractResult;
}

/**
 * Creates an ExtractError
 */
function createError(code: ExtractError['code'], message: string): ExtractError {
  return { code, message };
}

/**
 * Extracts BV number from URL
 * Requirement 2.1: Extract bvid using pattern matching
 * 
 * @param url - The URL to extract from
 * @returns The bvid if found, undefined otherwise
 */
function extractBvid(url: string): string | undefined {
  const match = url.match(BVID_PATTERN);
  return match ? match[0] : undefined;
}

/**
 * Extracts av number from URL
 * Requirement 2.2: Extract aid as a numeric value
 * Requirement 2.6: Support /video/avxxx URL format
 * 
 * @param url - The URL to extract from
 * @returns The aid as number if found, undefined otherwise
 */
function extractAid(url: string): number | undefined {
  // Try URL path format first: /video/av12345
  const urlMatch = url.match(AID_URL_PATTERN);
  if (urlMatch && urlMatch[1]) {
    return parseInt(urlMatch[1], 10);
  }

  // Try query parameter format: ?aid=12345
  const queryMatch = url.match(AID_QUERY_PATTERN);
  if (queryMatch && queryMatch[1]) {
    return parseInt(queryMatch[1], 10);
  }

  return undefined;
}

/**
 * Extracts part index from URL
 * Requirement 2.3: Extract part index (1-based) from p parameter
 * Requirement 2.4: Default to 1 when no p parameter is present
 * 
 * @param url - The URL to extract from
 * @returns The part index (defaults to 1)
 */
function extractPart(url: string): number {
  const match = url.match(PART_PATTERN);
  if (match && match[1]) {
    const part = parseInt(match[1], 10);
    // Ensure part is at least 1
    return part >= 1 ? part : 1;
  }
  return 1; // Default to 1 when no p parameter
}

/**
 * Validates if the URL is a valid Bilibili video URL format
 * 
 * @param url - The URL to validate
 * @returns true if valid Bilibili URL format
 */
function isValidBilibiliUrl(url: string): boolean {
  // Check for bilibili.com video URLs
  const bilibiliPattern = /^https?:\/\/(www\.)?bilibili\.com\/video\//i;
  return bilibiliPattern.test(url);
}

/**
 * Extracts video identifiers from a normalized URL
 * 
 * Implements:
 * - Requirement 2.1: BV number extraction
 * - Requirement 2.2: av number extraction
 * - Requirement 2.3: Part index extraction
 * - Requirement 2.4: Default part index to 1
 * - Requirement 2.5: Error for invalid URLs
 * - Requirement 2.6: Support both /video/BVxxx and /video/avxxx formats
 * 
 * @param url - The normalized URL to extract identifiers from
 * @returns ExtractResult with VideoIdentifier or error
 */
export function extract(url: string): ExtractResult {
  // Validate input
  if (!url || typeof url !== 'string') {
    return {
      success: false,
      error: createError('INVALID_FORMAT', 'URL must be a non-empty string')
    };
  }

  // Trim whitespace
  const trimmedUrl = url.trim();

  // Check if it's a valid Bilibili URL format
  if (!isValidBilibiliUrl(trimmedUrl)) {
    return {
      success: false,
      error: createError('INVALID_FORMAT', 'URL is not a valid Bilibili video URL format')
    };
  }

  // Extract identifiers
  const bvid = extractBvid(trimmedUrl);
  const aid = extractAid(trimmedUrl);
  const part = extractPart(trimmedUrl);

  // Requirement 2.5: Return error if neither bvid nor aid can be extracted
  if (!bvid && aid === undefined) {
    return {
      success: false,
      error: createError('NO_VIDEO_ID', 'Could not extract bvid or aid from URL')
    };
  }

  // Build the result
  const identifier: VideoIdentifier = {
    part
  };

  if (bvid) {
    identifier.bvid = bvid;
  }

  if (aid !== undefined) {
    identifier.aid = aid;
  }

  return {
    success: true,
    data: identifier
  };
}

/**
 * IDExtractor class implementation
 */
export class IDExtractorImpl implements IDExtractor {
  extract(url: string): ExtractResult {
    return extract(url);
  }
}

/**
 * Creates a new IDExtractor instance
 */
export function createIDExtractor(): IDExtractor {
  return new IDExtractorImpl();
}

// Export patterns for testing
export const patterns = {
  BVID_PATTERN,
  AID_URL_PATTERN,
  AID_QUERY_PATTERN,
  PART_PATTERN
};
