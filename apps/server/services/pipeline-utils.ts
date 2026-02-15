/**
 * Pipeline Utilities
 *
 * Shared interfaces, classes, and utility functions used by summary-pipeline.ts.
 * Migrated from the legacy video-processor.ts to support backend simplification.
 *
 * Requirements: 2.2
 */

import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline as pipelineStream } from 'stream/promises';

import { logDiagnostic, logDiagnosticError } from './diagnostic-logger.js';
import { RETRY_CONFIG } from '../constants/index.js';
import { isRetryableError, sleep } from '../utils/retry.js';

/**
 * Default retry configuration - re-exported from constants for backward compatibility
 * @deprecated Use RETRY_CONFIG from '../constants/index.js' instead
 */
export const DEFAULT_MAX_RETRIES = RETRY_CONFIG.MAX_RETRIES;
export const DEFAULT_RETRY_DELAY_MS = RETRY_CONFIG.BASE_DELAY_MS;

/**
 * Video info extracted from Bilibili
 */
export interface VideoInfo {
  title: string;
  bvid: string;
  aid: number;
  cid: number;
  part: number;
  partTitle: string;
  videoUrl: string;
}

/**
 * Bilibili Video Parser interface for dependency injection
 */
export interface BilibiliVideoParser {
  parseVideo(url: string, part: number): Promise<VideoInfo | null>;
}

/**
 * Video Downloader interface for dependency injection
 */
export interface VideoDownloader {
  download(
    url: string,
    outputPath: string,
    options?: { referer?: string; userAgent?: string; signal?: AbortSignal }
  ): Promise<void>;
}

/**
 * Default Bilibili video parser implementation
 */
export class DefaultBilibiliVideoParser implements BilibiliVideoParser {
  async parseVideo(url: string, part: number): Promise<VideoInfo | null> {
    try {
      const { normalize, extract, fetchMetadata, fetchPlayUrl, QUALITY_PARAMS, FORMAT_FLAGS } =
        await import('../../../packages/parser-core/src/index.js');

      // Build URL with part parameter
      let targetUrl = url;
      if (part > 1) {
        targetUrl = url.includes('?')
          ? url.replace(/[?&]p=\d+/, '') + `&p=${part}`
          : `${url}?p=${part}`;
      }

      // Step 1: Normalize URL
      const normalizeResult = await normalize(targetUrl);
      if (!normalizeResult.success) {
        logDiagnostic('warn', 'pipeline-utils', 'normalize_failed', {
          url: targetUrl,
          error: normalizeResult.error,
        });
        return null;
      }

      // Step 2: Extract video ID
      const extractResult = extract(normalizeResult.url!);
      if (!extractResult.success) {
        logDiagnostic('warn', 'pipeline-utils', 'extract_failed', {
          url: normalizeResult.url,
          error: extractResult.error,
        });
        return null;
      }

      // Step 3: Fetch metadata
      const metadataResult = await fetchMetadata(extractResult.data!, {});
      if (!metadataResult.success) {
        logDiagnostic('warn', 'pipeline-utils', 'metadata_failed', {
          url: normalizeResult.url,
          identifier: extractResult.data,
          error: metadataResult.error,
        });
        return null;
      }

      const metadata = metadataResult.data!;

      // Step 4: Fetch play URL with FLV format (same as original script)
      const playUrlResult = await fetchPlayUrl(
        {
          bvid: metadata.bvid,
          cid: metadata.cid,
          qn: QUALITY_PARAMS.QN_1080P,
          fnval: FORMAT_FLAGS.FLV
        },
        {}
      );

      if (!playUrlResult.success || !playUrlResult.data?.durl) {
        logDiagnostic('warn', 'pipeline-utils', 'playurl_failed', {
          url: normalizeResult.url,
          bvid: metadata.bvid,
          cid: metadata.cid,
          error: playUrlResult.error,
        });
        return null;
      }

      const partInfo = metadata.pages.find((p: { page: number }) => p.page === extractResult.data!.part);

      return {
        title: metadata.title,
        bvid: metadata.bvid,
        aid: metadata.aid,
        cid: metadata.cid,
        part: extractResult.data!.part,
        partTitle: partInfo?.part || '',
        videoUrl: playUrlResult.data.durl[0].url,
      };
    } catch (error) {
      logDiagnosticError('pipeline-utils', 'parse_video_failed', error, { url, part });
      return null;
    }
  }
}

/**
 * Default video downloader implementation using fetch
 */
export class DefaultVideoDownloader implements VideoDownloader {
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options?: { maxRetries?: number; retryDelayMs?: number }) {
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  async download(
    url: string,
    outputPath: string,
    options?: { referer?: string; userAgent?: string; signal?: AbortSignal }
  ): Promise<void> {
    const headers: Record<string, string> = {
      Referer: options?.referer ?? 'https://www.bilibili.com',
      'User-Agent':
        options?.userAgent ??
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await sleep(this.retryDelayMs * Math.pow(2, attempt - 1));
        }

        const response = await fetch(url, { headers, signal: options?.signal });

        if (!response.ok) {
          throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
        }

        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        if (!response.body) {
          throw new Error('Download failed: empty response body');
        }

        const writeStream = fs.createWriteStream(outputPath);
        try {
          await pipelineStream(Readable.fromWeb(response.body as globalThis.ReadableStream), writeStream);
        } catch (error) {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
          throw error;
        }
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logDiagnosticError('pipeline-utils', 'download_attempt_failed', lastError, {
          url,
          outputPath,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
        });
        if (!isRetryableError(lastError)) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error('Download failed after retries');
}
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip noisy prefixes like:
 * - "<video title> - P27 <part title>"
 * - "P27 <part title>"
 */
export function buildDisplayTitle(
  videoTitle: string,
  part: number,
  partTitle?: string
): string {
  const trimmedPartTitle = partTitle?.trim() ?? '';
  if (!trimmedPartTitle) {
    const fallbackTitle = videoTitle.trim();
    return fallbackTitle || `P${part}`;
  }

  const escapedVideoTitle = escapeRegExp(videoTitle.trim());
  const partToken = `P\\s*(?:0*${part}|\\d+)`;

  const fullPrefixPattern = new RegExp(
    `^${escapedVideoTitle}\\s*[-_:|]\\s*${partToken}\\b\\s*[-_:|]?\\s*(.*)$`,
    'i'
  );
  const partOnlyPrefixPattern = new RegExp(
    `^${partToken}\\b\\s*[-_:|]?\\s*(.*)$`,
    'i'
  );

  const fullPrefixMatch = trimmedPartTitle.match(fullPrefixPattern);
  if (fullPrefixMatch) {
    const stripped = fullPrefixMatch[1]?.trim() ?? '';
    return stripped || `P${part}`;
  }

  const partOnlyMatch = trimmedPartTitle.match(partOnlyPrefixPattern);
  if (partOnlyMatch) {
    const stripped = partOnlyMatch[1]?.trim() ?? '';
    return stripped || `P${part}`;
  }

  return trimmedPartTitle;
}

export function generateTempFilePath(tempDir: string, part: number): string {
  const timestamp = Date.now();
  const filename = `bili_p${part}_${timestamp}.mp4`;
  return path.join(tempDir, filename);
}
