/**
 * URL Normalizer for Bilibili Video Parser
 *
 * Normalizes various Bilibili URL formats to standard format.
 * Handles short links (b23.tv) and preserves query parameters.
 *
 * Implements Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { NormalizeResult, NormalizeError } from './types.js';

/**
 * Normalizer interface
 */
export interface Normalizer {
  normalize(url: string): Promise<NormalizeResult>;
}

/**
 * Regular expressions for URL validation
 */
const URL_PATTERNS = {
  // b23.tv short link pattern
  SHORT_LINK: /^https?:\/\/b23\.tv\/[a-zA-Z0-9]+/,
  // Standard bilibili.com video URL patterns
  BILIBILI_VIDEO: /^https?:\/\/(www\.)?bilibili\.com\/video\/(BV[a-zA-Z0-9]+|av\d+)/i,
  // General bilibili.com URL (for validation)
  BILIBILI_DOMAIN: /^https?:\/\/(www\.)?bilibili\.com\//i,
} as const;

/**
 * Check if a string is a valid URL
 * @param urlString - String to validate
 * @returns true if valid URL, false otherwise
 */
function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if URL is a b23.tv short link
 * Requirement 1.1: Handle b23.tv short links
 * @param url - URL to check
 * @returns true if short link, false otherwise
 */
export function isShortLink(url: string): boolean {
  return URL_PATTERNS.SHORT_LINK.test(url);
}

/**
 * Check if URL is a valid Bilibili video URL
 * @param url - URL to check
 * @returns true if valid Bilibili video URL, false otherwise
 */
export function isBilibiliVideoUrl(url: string): boolean {
  return URL_PATTERNS.BILIBILI_VIDEO.test(url);
}

/**
 * Check if URL is any Bilibili domain URL
 * @param url - URL to check
 * @returns true if Bilibili domain, false otherwise
 */
export function isBilibiliUrl(url: string): boolean {
  return URL_PATTERNS.BILIBILI_DOMAIN.test(url) || isShortLink(url);
}

/**
 * Follow HTTP 302 redirect for short links
 * Requirement 1.1: Follow HTTP 302 redirects and return the full bilibili.com URL
 * Requirement 1.5: Return error with HTTP status code if redirect fails
 *
 * @param shortUrl - The b23.tv short URL to resolve
 * @returns Promise resolving to the redirect target URL or error
 */
async function followRedirect(shortUrl: string): Promise<NormalizeResult> {
  try {
    // Use HEAD request to get redirect location without downloading body
    const response = await fetch(shortUrl, {
      method: 'HEAD',
      redirect: 'manual', // Don't follow redirects automatically
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    // Check for redirect status codes (301, 302, 303, 307, 308)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        // Requirement 1.3: Preserve query parameters from redirect target
        return {
          success: true,
          url: location,
        };
      }
    }

    // If not a redirect or no location header, try GET request
    // Some servers may not respond to HEAD properly
    if (response.status === 200 || response.status === 405) {
      const getResponse = await fetch(shortUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (getResponse.status >= 300 && getResponse.status < 400) {
        const location = getResponse.headers.get('location');
        if (location) {
          return {
            success: true,
            url: location,
          };
        }
      }

      // Requirement 1.5: Return error with HTTP status code
      return {
        success: false,
        error: {
          code: 'REDIRECT_FAILED',
          message: `Short link did not redirect. HTTP status: ${getResponse.status}`,
          httpStatus: getResponse.status,
        },
      };
    }

    // Requirement 1.5: Return error with HTTP status code
    return {
      success: false,
      error: {
        code: 'REDIRECT_FAILED',
        message: `Failed to follow redirect. HTTP status: ${response.status}`,
        httpStatus: response.status,
      },
    };
  } catch (error) {
    // Network error or other fetch failure
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: {
        code: 'REDIRECT_FAILED',
        message: `Failed to resolve short link: ${errorMessage}`,
        httpStatus: 0,
      },
    };
  }
}

/**
 * Normalize a Bilibili URL
 *
 * Implementation logic:
 * 1. Validate URL format (Requirement 1.4)
 * 2. Check if it's a b23.tv short link (Requirement 1.1)
 * 3. If short link, execute HTTP HEAD request to get 302 redirect target
 * 4. Return normalized full URL with query parameters preserved (Requirement 1.2, 1.3)
 *
 * @param url - The URL to normalize
 * @returns Promise resolving to NormalizeResult
 */
export async function normalize(url: string): Promise<NormalizeResult> {
  // Step 1: Validate URL format
  // Requirement 1.4: Return descriptive error for invalid URL format
  if (!url || typeof url !== 'string') {
    return {
      success: false,
      error: {
        code: 'INVALID_URL',
        message: 'URL must be a non-empty string',
      },
    };
  }

  const trimmedUrl = url.trim();

  if (!isValidUrl(trimmedUrl)) {
    return {
      success: false,
      error: {
        code: 'INVALID_URL',
        message: 'Invalid URL format',
      },
    };
  }

  // Step 2: Check if it's a Bilibili URL
  // Requirement 1.4: Return error if not a valid Bilibili link
  if (!isBilibiliUrl(trimmedUrl)) {
    return {
      success: false,
      error: {
        code: 'NOT_BILIBILI_URL',
        message: 'URL is not a valid Bilibili link. Expected b23.tv or bilibili.com domain',
      },
    };
  }

  // Step 3: Handle b23.tv short links
  // Requirement 1.1: Follow HTTP 302 redirects for short links
  if (isShortLink(trimmedUrl)) {
    const redirectResult = await followRedirect(trimmedUrl);

    if (!redirectResult.success) {
      return redirectResult;
    }

    // Validate that the redirect target is a Bilibili URL
    if (redirectResult.url && !isBilibiliVideoUrl(redirectResult.url)) {
      // The redirect might go to a non-video page, which is still valid
      // but we should check if it's at least a Bilibili domain
      if (!URL_PATTERNS.BILIBILI_DOMAIN.test(redirectResult.url)) {
        return {
          success: false,
          error: {
            code: 'NOT_BILIBILI_URL',
            message: 'Short link did not redirect to a Bilibili URL',
          },
        };
      }
    }

    return redirectResult;
  }

  // Step 4: Standard bilibili.com URL
  // Requirement 1.2: Return standard bilibili.com video URL unchanged
  // Requirement 1.3: Preserve all query parameters including p parameter
  if (isBilibiliVideoUrl(trimmedUrl)) {
    return {
      success: true,
      url: trimmedUrl,
    };
  }

  // URL is on bilibili.com but not a video URL
  return {
    success: false,
    error: {
      code: 'NOT_BILIBILI_URL',
      message: 'URL is not a valid Bilibili video link. Expected /video/BVxxx or /video/avxxx format',
    },
  };
}

/**
 * Create a Normalizer instance
 * @returns Normalizer implementation
 */
export function createNormalizer(): Normalizer {
  return {
    normalize,
  };
}

// Export default normalizer instance
export const normalizer = createNormalizer();
