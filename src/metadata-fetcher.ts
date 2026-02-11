/**
 * Metadata Fetcher for Bilibili Video Parser
 *
 * Fetches video metadata from Bilibili API including cid and page information.
 * Implements Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { Config, VideoIdentifier, VideoMetadata, MetadataResult, APIError, PageInfo } from './types.js';
import { HttpClient, createHttpClient } from './http-client.js';

/**
 * Bilibili View API endpoint
 */
const VIEW_API_URL = 'https://api.bilibili.com/x/web-interface/view';

/**
 * Bilibili API page structure
 */
interface BilibiliPageData {
  cid: number;
  page: number;
  part: string;
  duration: number;
}

/**
 * Bilibili API video data structure
 */
interface BilibiliVideoData {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  duration: number;
  pages: BilibiliPageData[];
}

/**
 * Bilibili API response structure for view endpoint
 */
interface BilibiliViewResponse {
  code: number;
  message: string;
  ttl?: number;
  data?: BilibiliVideoData;
}

/**
 * Error code mapping for Bilibili API
 * Requirement 3.5: -404 indicates video deleted or does not exist
 * Requirement 3.6: -412 indicates WAF rate limiting
 */
const API_ERROR_CODES: Record<number, { type: string; message: string }> = {
  [-404]: {
    type: 'VIDEO_NOT_FOUND',
    message: 'Video is deleted or does not exist',
  },
  [-412]: {
    type: 'RATE_LIMITED',
    message: 'Request blocked by WAF rate limiting',
  },
  [-400]: {
    type: 'INVALID_PARAMS',
    message: 'Invalid request parameters',
  },
  [-403]: {
    type: 'FORBIDDEN',
    message: 'Access forbidden',
  },
  [62002]: {
    type: 'VIDEO_INVISIBLE',
    message: 'Video is not visible',
  },
  [62004]: {
    type: 'VIDEO_REVIEWING',
    message: 'Video is under review',
  },
};

/**
 * Map Bilibili API error code to APIError
 * @param code - Bilibili API error code
 * @param message - Original error message from API
 * @returns APIError object
 */
function mapApiError(code: number, message: string): APIError {
  const errorInfo = API_ERROR_CODES[code];
  if (errorInfo) {
    return {
      code,
      message: errorInfo.message,
    };
  }
  return {
    code,
    message: message || `API error: ${code}`,
  };
}

/**
 * Build URL for view API request
 * Requirements 3.1, 3.2: Support both bvid and aid
 * @param id - Video identifier
 * @returns API URL with query parameters
 */
function buildViewApiUrl(id: VideoIdentifier): string {
  const url = new URL(VIEW_API_URL);
  
  if (id.bvid) {
    url.searchParams.set('bvid', id.bvid);
  } else if (id.aid !== undefined) {
    url.searchParams.set('aid', id.aid.toString());
  }
  
  return url.toString();
}

/**
 * Select cid for the requested part from pages array
 * Requirement 3.4: Return cid for specific part index
 * @param pages - Array of page information
 * @param partIndex - 1-based part index
 * @returns Selected cid or undefined if part not found
 */
export function selectCidForPart(pages: PageInfo[], partIndex: number): number | undefined {
  // Part index is 1-based, array is 0-based
  const pageIndex = partIndex - 1;
  
  if (pageIndex < 0 || pageIndex >= pages.length) {
    return undefined;
  }
  
  const page = pages[pageIndex];
  return page ? page.cid : undefined;
}

/**
 * Transform API response pages to PageInfo array
 * Requirement 3.3: Return complete pages array with all part information
 * @param apiPages - Pages from API response
 * @returns Array of PageInfo
 */
function transformPages(apiPages: BilibiliPageData[]): PageInfo[] {
  return apiPages.map((page: BilibiliPageData) => ({
    cid: page.cid,
    part: page.part,
    page: page.page,
    duration: page.duration,
  }));
}

/**
 * MetadataFetcher interface
 */
export interface MetadataFetcher {
  fetch(id: VideoIdentifier, config?: Partial<Config>): Promise<MetadataResult>;
}

/**
 * Fetch video metadata from Bilibili API
 * Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 * 
 * @param id - Video identifier (bvid or aid with part index)
 * @param config - Optional configuration overrides
 * @param httpClient - Optional HTTP client instance (for testing)
 * @returns MetadataResult with video metadata or error
 */
export async function fetchMetadata(
  id: VideoIdentifier,
  config?: Partial<Config>,
  httpClient?: HttpClient
): Promise<MetadataResult> {
  // Validate input
  if (!id.bvid && id.aid === undefined) {
    return {
      success: false,
      error: {
        code: -400,
        message: 'Either bvid or aid must be provided',
      },
    };
  }

  // Create HTTP client with config
  // Requirement 3.7: Set required Referer header (handled by HttpClient)
  const client = httpClient ?? createHttpClient(config);
  
  // Build API URL
  const url = buildViewApiUrl(id);
  
  // Make API request
  const response = await client.get<BilibiliViewResponse>(url);
  
  // Handle HTTP errors
  if (!response.success) {
    return {
      success: false,
      error: {
        code: response.error?.httpStatus ?? -1,
        message: response.error?.message ?? 'Network error',
        httpStatus: response.error?.httpStatus,
      },
    };
  }
  
  const apiResponse = response.data;
  
  // Check if response data exists
  if (!apiResponse) {
    return {
      success: false,
      error: {
        code: -1,
        message: 'Invalid API response: empty response',
      },
    };
  }
  
  // Handle API errors
  // Requirements 3.5, 3.6: Map error codes -404 and -412
  if (apiResponse.code !== 0) {
    return {
      success: false,
      error: mapApiError(apiResponse.code, apiResponse.message),
    };
  }
  
  // Validate response data
  if (!apiResponse.data) {
    return {
      success: false,
      error: {
        code: -1,
        message: 'Invalid API response: missing data',
      },
    };
  }
  
  const data = apiResponse.data;
  
  // Transform pages
  // Requirement 3.3: Return complete pages array
  const pages = transformPages(data.pages);
  
  // Select cid for requested part
  // Requirement 3.4: Return cid for specific part
  const partIndex = id.part ?? 1;
  const selectedCid = selectCidForPart(pages, partIndex);
  
  // Handle invalid part index
  if (selectedCid === undefined) {
    return {
      success: false,
      error: {
        code: -400,
        message: `Invalid part index: ${partIndex}. Video has ${pages.length} part(s).`,
      },
    };
  }
  
  // Build successful result
  const metadata: VideoMetadata = {
    bvid: data.bvid,
    aid: data.aid,
    cid: selectedCid,
    title: data.title,
    pages,
    duration: data.duration,
  };
  
  return {
    success: true,
    data: metadata,
  };
}

/**
 * Create a MetadataFetcher instance
 * @param config - Optional default configuration
 * @returns MetadataFetcher implementation
 */
export function createMetadataFetcher(config?: Partial<Config>): MetadataFetcher {
  const httpClient = createHttpClient(config);
  
  return {
    fetch: (id: VideoIdentifier, overrideConfig?: Partial<Config>) => {
      // Merge configs if override provided
      if (overrideConfig) {
        const mergedClient = createHttpClient({ ...config, ...overrideConfig });
        return fetchMetadata(id, overrideConfig, mergedClient);
      }
      return fetchMetadata(id, config, httpClient);
    },
  };
}

// Export default fetcher factory
export default createMetadataFetcher;
