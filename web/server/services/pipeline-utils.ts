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

/**
 * Default retry configuration
 */
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_DELAY_MS = 1000;

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
    options?: { referer?: string; userAgent?: string }
  ): Promise<void>;
}

/**
 * Default Bilibili video parser implementation
 * Uses the same flow as tingwu-transcribe-oss.js
 */
export class DefaultBilibiliVideoParser implements BilibiliVideoParser {
  async parseVideo(url: string, part: number): Promise<VideoInfo | null> {
    try {
      const { normalize, extract, fetchMetadata, fetchPlayUrl, QUALITY_PARAMS, FORMAT_FLAGS } = 
        await import('../../../src/index.js');

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
        console.error('URL 标准化失败:', normalizeResult.error);
        return null;
      }

      // Step 2: Extract video ID
      const extractResult = extract(normalizeResult.url!);
      if (!extractResult.success) {
        console.error('提取 ID 失败:', extractResult.error);
        return null;
      }

      // Step 3: Fetch metadata
      const metadataResult = await fetchMetadata(extractResult.data!, {});
      if (!metadataResult.success) {
        console.error('获取元数据失败:', metadataResult.error);
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
        console.error('获取播放链接失败:', playUrlResult.error);
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
      console.error('解析视频失败:', error);
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
    options?: { referer?: string; userAgent?: string }
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
          await this.sleep(this.retryDelayMs * Math.pow(2, attempt - 1));
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
          throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, buffer);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!this.isRetryableError(lastError)) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error('Download failed after retries');
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('429') ||
      message.includes('rate')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function sanitizeFilename(filename: string): string {
  return filename
    .trim()
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
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

export function generateOSSKey(part: number): string {
  const timestamp = Date.now();
  return `bilibili/p${part}_${timestamp}.mp4`;
}
