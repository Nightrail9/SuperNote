/**
 * PlayURL Fetcher for Bilibili Video Parser
 *
 * Fetches video stream URLs from Bilibili PlayURL API.
 * Implements Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import {
  Config,
  PlayURLParams,
  PlayURLResult,
  StreamInfo,
  DashInfo,
  DashStream,
  DurlInfo,
  QualityOption,
  APIError,
} from './types.js';
import { HttpClient, createHttpClient } from './http-client.js';

/**
 * Bilibili PlayURL API endpoint
 * Requirement 4.1: Call playurl API with valid bvid and cid
 */
const PLAYURL_API_URL = 'https://api.bilibili.com/x/player/playurl';

/**
 * Default quality parameter values
 * Requirement 4.5: qn parameter for quality (127 for 8K, 120 for 4K)
 */
export const QUALITY_PARAMS = {
  QN_8K: 127,
  QN_4K: 120,
  QN_1080P_PLUS: 116,
  QN_1080P: 80,
  QN_720P: 64,
  QN_480P: 32,
  QN_360P: 16,
} as const;

/**
 * Format flag values
 * Requirement 4.2: fnval=4048 for DASH format
 */
export const FORMAT_FLAGS = {
  DASH: 4048,  // DASH format with all codecs
  FLV: 0,      // FLV/MP4 format
} as const;

/**
 * Quality descriptions mapping
 */
const QUALITY_DESCRIPTIONS: Record<number, string> = {
  127: '8K 超高清',
  126: '杜比视界',
  125: 'HDR 真彩',
  120: '4K 超清',
  116: '1080P 60帧',
  112: '1080P 高码率',
  80: '1080P 高清',
  74: '720P 60帧',
  64: '720P 高清',
  32: '480P 清晰',
  16: '360P 流畅',
};

/**
 * Bilibili API DASH stream structure
 */
interface BilibiliDashStream {
  id: number;
  baseUrl: string;
  base_url?: string;
  backupUrl?: string[];
  backup_url?: string[];
  bandwidth: number;
  codecs: string;
  width?: number;
  height?: number;
}

/**
 * Bilibili API DASH info structure
 */
interface BilibiliDashInfo {
  video: BilibiliDashStream[];
  audio: BilibiliDashStream[] | null;
}

/**
 * Bilibili API durl structure
 */
interface BilibiliDurl {
  url: string;
  backup_url?: string[];
  size: number;
  length: number;
}

/**
 * Bilibili API playurl data structure
 */
interface BilibiliPlayUrlData {
  quality: number;
  format: string;
  timelength: number;
  accept_quality: number[];
  accept_description: string[];
  dash?: BilibiliDashInfo;
  durl?: BilibiliDurl[];
}

/**
 * Bilibili API response structure for playurl endpoint
 */
interface BilibiliPlayUrlResponse {
  code: number;
  message: string;
  ttl?: number;
  data?: BilibiliPlayUrlData;
}

/**
 * Error code mapping for PlayURL API
 * Requirement 4.6: HTTP 403 indicates missing Referer header
 * Requirement 4.7: API code -404 indicates invalid parameters
 */
const API_ERROR_CODES: Record<number, { type: string; message: string }> = {
  [-404]: {
    type: 'INVALID_PARAMS',
    message: 'Invalid parameters: video or cid not found',
  },
  [-400]: {
    type: 'INVALID_PARAMS',
    message: 'Invalid request parameters',
  },
  [-403]: {
    type: 'FORBIDDEN',
    message: 'Access forbidden: authentication required',
  },
  [-412]: {
    type: 'RATE_LIMITED',
    message: 'Request blocked by WAF rate limiting',
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
 * Build URL for playurl API request
 * Requirements 4.1, 4.2, 4.5: Build URL with bvid, cid, qn, fnval parameters
 * @param params - PlayURL parameters
 * @returns API URL with query parameters
 */
export function buildPlayUrlApiUrl(params: PlayURLParams): string {
  const url = new URL(PLAYURL_API_URL);
  
  url.searchParams.set('bvid', params.bvid);
  url.searchParams.set('cid', params.cid.toString());
  
  // Requirement 4.5: Set qn parameter for quality
  url.searchParams.set('qn', (params.qn ?? QUALITY_PARAMS.QN_8K).toString());
  
  // Requirement 4.2: Set fnval for format (4048 for DASH)
  url.searchParams.set('fnval', (params.fnval ?? FORMAT_FLAGS.DASH).toString());
  
  // Request 4K support
  url.searchParams.set('fourk', (params.fourk ?? 1).toString());
  
  // Set platform to html5 to get publicly accessible URLs (without Referer restriction)
  url.searchParams.set('platform', 'html5');
  url.searchParams.set('high_quality', '1');
  
  return url.toString();
}

/**
 * Transform API DASH stream to internal DashStream format
 * @param stream - API DASH stream data
 * @returns DashStream object
 */
function transformDashStream(stream: BilibiliDashStream): DashStream {
  return {
    id: stream.id,
    baseUrl: stream.baseUrl || stream.base_url || '',
    backupUrl: stream.backupUrl || stream.backup_url || [],
    bandwidth: stream.bandwidth,
    codecs: stream.codecs,
    width: stream.width,
    height: stream.height,
  };
}

/**
 * Transform API DASH info to internal DashInfo format
 * Requirement 4.2: Process DASH format with separate video and audio streams
 * @param dash - API DASH info
 * @returns DashInfo object
 */
function transformDashInfo(dash: BilibiliDashInfo): DashInfo {
  return {
    video: dash.video.map(transformDashStream),
    audio: (dash.audio || []).map(transformDashStream),
  };
}

/**
 * Transform API durl to internal DurlInfo format
 * Requirement 4.3: Process FLV/MP4 format
 * @param durl - API durl data
 * @returns DurlInfo object
 */
function transformDurl(durl: BilibiliDurl): DurlInfo {
  return {
    url: durl.url,
    backupUrl: durl.backup_url || [],
    size: durl.size,
    length: durl.length,
  };
}

/**
 * Build quality options from API response
 * @param acceptQuality - Array of quality IDs
 * @param acceptDescription - Array of quality descriptions
 * @returns Array of QualityOption
 */
function buildQualityOptions(
  acceptQuality: number[],
  acceptDescription: string[]
): QualityOption[] {
  return acceptQuality.map((quality, index) => ({
    quality,
    description: acceptDescription[index] || QUALITY_DESCRIPTIONS[quality] || `Quality ${quality}`,
  }));
}

/**
 * Determine stream format from API response
 * @param data - API response data
 * @returns Stream format type
 */
function determineFormat(data: BilibiliPlayUrlData): 'dash' | 'flv' | 'mp4' {
  if (data.dash) {
    return 'dash';
  }
  // Check format string for mp4
  if (data.format && data.format.includes('mp4')) {
    return 'mp4';
  }
  return 'flv';
}

/**
 * Transform API response to StreamInfo
 * @param data - API response data
 * @returns StreamInfo object
 */
function transformToStreamInfo(data: BilibiliPlayUrlData): StreamInfo {
  const format = determineFormat(data);
  
  const streamInfo: StreamInfo = {
    format,
    quality: data.quality,
    acceptQuality: buildQualityOptions(data.accept_quality, data.accept_description),
  };
  
  if (data.dash) {
    streamInfo.dash = transformDashInfo(data.dash);
  }
  
  if (data.durl) {
    streamInfo.durl = data.durl.map(transformDurl);
  }
  
  return streamInfo;
}

/**
 * PlayURLFetcher interface
 */
export interface PlayURLFetcher {
  fetch(params: PlayURLParams, config?: Partial<Config>): Promise<PlayURLResult>;
  fetchWithFallback(params: PlayURLParams, config?: Partial<Config>): Promise<PlayURLResult>;
}

/**
 * Fetch play URL from Bilibili API
 * Requirements 4.1, 4.2, 4.4, 4.5, 4.6, 4.7, 4.8
 * 
 * @param params - PlayURL parameters (bvid, cid, qn, fnval, fourk)
 * @param config - Optional configuration overrides
 * @param httpClient - Optional HTTP client instance (for testing)
 * @returns PlayURLResult with stream info or error
 */
export async function fetchPlayUrl(
  params: PlayURLParams,
  config?: Partial<Config>,
  httpClient?: HttpClient
): Promise<PlayURLResult> {
  // Validate input
  if (!params.bvid) {
    return {
      success: false,
      error: {
        code: -400,
        message: 'bvid is required',
      },
    };
  }
  
  if (!params.cid || params.cid <= 0) {
    return {
      success: false,
      error: {
        code: -400,
        message: 'Valid cid is required',
      },
    };
  }

  // Create HTTP client with config
  // Requirement 4.8: Set required Referer and User-Agent headers (handled by HttpClient)
  // Requirement 4.4: SESSDATA Cookie injection (handled by HttpClient)
  const client = httpClient ?? createHttpClient(config);
  
  // Build API URL
  const url = buildPlayUrlApiUrl(params);
  
  // Make API request
  const response = await client.get<BilibiliPlayUrlResponse>(url);
  
  // Handle HTTP errors
  // Requirement 4.6: HTTP 403 indicates missing Referer header
  if (!response.success) {
    const httpStatus = response.error?.httpStatus;
    
    if (httpStatus === 403) {
      return {
        success: false,
        error: {
          code: 403,
          message: 'HTTP 403 Forbidden: Missing or invalid Referer header',
          httpStatus: 403,
        },
      };
    }
    
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
  // Requirement 4.7: API code -404 indicates invalid parameters
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
  
  // Transform response to StreamInfo
  const streamInfo = transformToStreamInfo(apiResponse.data);
  
  return {
    success: true,
    data: streamInfo,
  };
}

/**
 * Fetch play URL with fallback from DASH to FLV
 * Requirement 4.3: Fall back to FLV/MP4 when DASH unavailable
 * 
 * @param params - PlayURL parameters
 * @param config - Optional configuration overrides
 * @param httpClient - Optional HTTP client instance (for testing)
 * @returns PlayURLResult with stream info or error
 */
export async function fetchPlayUrlWithFallback(
  params: PlayURLParams,
  config?: Partial<Config>,
  httpClient?: HttpClient
): Promise<PlayURLResult> {
  // First try DASH format (fnval=4048)
  const dashParams: PlayURLParams = {
    ...params,
    fnval: FORMAT_FLAGS.DASH,
  };
  
  const dashResult = await fetchPlayUrl(dashParams, config, httpClient);
  
  // If DASH succeeded and has dash data, return it
  if (dashResult.success && dashResult.data?.dash) {
    return dashResult;
  }
  
  // Requirement 4.3: Fall back to FLV/MP4 (fnval=0)
  const flvParams: PlayURLParams = {
    ...params,
    fnval: FORMAT_FLAGS.FLV,
  };
  
  const flvResult = await fetchPlayUrl(flvParams, config, httpClient);
  
  // If FLV succeeded, return it
  if (flvResult.success) {
    return flvResult;
  }
  
  // If both failed, return the DASH error (more informative)
  // unless DASH succeeded but had no dash data
  if (!dashResult.success) {
    return dashResult;
  }
  
  // DASH succeeded but no dash data, and FLV failed
  return flvResult;
}

/**
 * Create a PlayURLFetcher instance
 * @param config - Optional default configuration
 * @returns PlayURLFetcher implementation
 */
export function createPlayUrlFetcher(config?: Partial<Config>): PlayURLFetcher {
  const httpClient = createHttpClient(config);
  
  return {
    fetch: (params: PlayURLParams, overrideConfig?: Partial<Config>) => {
      if (overrideConfig) {
        const mergedClient = createHttpClient({ ...config, ...overrideConfig });
        return fetchPlayUrl(params, overrideConfig, mergedClient);
      }
      return fetchPlayUrl(params, config, httpClient);
    },
    
    fetchWithFallback: (params: PlayURLParams, overrideConfig?: Partial<Config>) => {
      if (overrideConfig) {
        const mergedClient = createHttpClient({ ...config, ...overrideConfig });
        return fetchPlayUrlWithFallback(params, overrideConfig, mergedClient);
      }
      return fetchPlayUrlWithFallback(params, config, httpClient);
    },
  };
}

// Export default fetcher factory
export default createPlayUrlFetcher;
