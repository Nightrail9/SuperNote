/**
 * Stream Synthesizer for Bilibili Video Parser
 *
 * Reorganizes stream information into a unified output format.
 * Implements Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import {
  StreamInfo,
  VideoMetadata,
  ParseResult,
  ParsedVideo,
  StreamOption,
  DashStream,
  QualityOption,
} from './types.js';

/**
 * Quality descriptions mapping for fallback
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
 * Get quality description from quality ID
 * @param quality - Quality ID
 * @param acceptQuality - Available quality options from API
 * @returns Quality description string
 */
function getQualityDescription(
  quality: number,
  acceptQuality: QualityOption[]
): string {
  // First try to find in acceptQuality
  const found = acceptQuality.find((q) => q.quality === quality);
  if (found) {
    return found.description;
  }
  // Fallback to static mapping
  return QUALITY_DESCRIPTIONS[quality] || `Quality ${quality}`;
}

/**
 * Synthesize DASH streams into StreamOption array
 * Requirement 5.1: DASH streams organized with video and audio separately with quality info
 * Requirement 5.3: Include stream quality info (resolution, bitrate, codec)
 * 
 * @param streamInfo - Stream information from PlayURL API
 * @returns Array of StreamOption for DASH format
 */
function synthesizeDashStreams(streamInfo: StreamInfo): StreamOption[] {
  if (!streamInfo.dash) {
    return [];
  }

  const { video: videoStreams, audio: audioStreams } = streamInfo.dash;
  const options: StreamOption[] = [];

  // Group video streams by quality ID
  const videoByQuality = new Map<number, DashStream>();
  for (const video of videoStreams) {
    // Keep the highest bandwidth stream for each quality
    const existing = videoByQuality.get(video.id);
    if (!existing || video.bandwidth > existing.bandwidth) {
      videoByQuality.set(video.id, video);
    }
  }

  // Find the best audio stream (highest bandwidth)
  let bestAudio: DashStream | undefined;
  if (audioStreams && audioStreams.length > 0) {
    bestAudio = audioStreams.reduce((best, current) =>
      current.bandwidth > best.bandwidth ? current : best
    );
  }

  // Create StreamOption for each video quality
  for (const [qualityId, video] of videoByQuality) {
    const option: StreamOption = {
      quality: qualityId,
      qualityDescription: getQualityDescription(qualityId, streamInfo.acceptQuality),
      format: 'dash',
      video: {
        url: video.baseUrl,
        backupUrls: video.backupUrl,
        codecs: video.codecs,
        width: video.width ?? 0,
        height: video.height ?? 0,
        bandwidth: video.bandwidth,
      },
    };

    // Attach audio if available
    if (bestAudio) {
      option.audio = {
        url: bestAudio.baseUrl,
        backupUrls: bestAudio.backupUrl,
        codecs: bestAudio.codecs,
        bandwidth: bestAudio.bandwidth,
      };
    }

    options.push(option);
  }

  return options;
}

/**
 * Synthesize FLV/MP4 streams into StreamOption array
 * Requirement 5.2: FLV streams return direct playable URL
 * Requirement 5.3: Include stream quality info
 * 
 * @param streamInfo - Stream information from PlayURL API
 * @returns Array of StreamOption for FLV/MP4 format
 */
function synthesizeFlvStreams(streamInfo: StreamInfo): StreamOption[] {
  if (!streamInfo.durl || streamInfo.durl.length === 0) {
    return [];
  }

  const options: StreamOption[] = [];
  const format = streamInfo.format === 'mp4' ? 'mp4' : 'flv';

  // For FLV/MP4, we typically have one URL per quality
  // The current quality is in streamInfo.quality
  for (const durl of streamInfo.durl) {
    const option: StreamOption = {
      quality: streamInfo.quality,
      qualityDescription: getQualityDescription(
        streamInfo.quality,
        streamInfo.acceptQuality
      ),
      format,
      url: durl.url,
    };
    options.push(option);
  }

  return options;
}

/**
 * Sort stream options by quality in descending order
 * Requirement 5.5: Multiple quality options sorted by quality descending
 * 
 * @param options - Array of StreamOption
 * @returns Sorted array (highest quality first)
 */
function sortByQualityDescending(options: StreamOption[]): StreamOption[] {
  return [...options].sort((a, b) => b.quality - a.quality);
}

/**
 * StreamSynthesizer interface
 */
export interface StreamSynthesizer {
  synthesize(streamInfo: StreamInfo, metadata: VideoMetadata): ParseResult;
}

/**
 * Synthesize stream information into ParseResult
 * Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 * 
 * @param streamInfo - Stream information from PlayURL API
 * @param metadata - Video metadata
 * @returns ParseResult with organized stream options
 */
export function synthesizeStreams(
  streamInfo: StreamInfo,
  metadata: VideoMetadata
): ParseResult {
  // Validate inputs
  if (!streamInfo) {
    return {
      success: false,
      error: {
        stage: 'synthesize',
        code: 'INVALID_INPUT',
        message: 'Stream info is required',
      },
    };
  }

  if (!metadata) {
    return {
      success: false,
      error: {
        stage: 'synthesize',
        code: 'INVALID_INPUT',
        message: 'Video metadata is required',
      },
    };
  }

  let streams: StreamOption[] = [];

  // Requirement 5.1: Process DASH streams (video/audio separately)
  if (streamInfo.format === 'dash' && streamInfo.dash) {
    streams = synthesizeDashStreams(streamInfo);
  }
  // Requirement 5.2: Process FLV/MP4 streams (direct URL)
  else if (streamInfo.durl && streamInfo.durl.length > 0) {
    streams = synthesizeFlvStreams(streamInfo);
  }

  // If no streams were synthesized, return error
  if (streams.length === 0) {
    return {
      success: false,
      error: {
        stage: 'synthesize',
        code: 'NO_STREAMS',
        message: 'No playable streams found in response',
      },
    };
  }

  // Requirement 5.5: Sort by quality descending
  const sortedStreams = sortByQualityDescending(streams);

  // Build ParsedVideo result
  const parsedVideo: ParsedVideo = {
    title: metadata.title,
    bvid: metadata.bvid,
    aid: metadata.aid,
    cid: metadata.cid,
    part: metadata.pages.findIndex((p) => p.cid === metadata.cid) + 1 || 1,
    duration: metadata.duration,
    streams: sortedStreams,
  };

  return {
    success: true,
    data: parsedVideo,
  };
}

/**
 * Create a StreamSynthesizer instance
 * @returns StreamSynthesizer implementation
 */
export function createStreamSynthesizer(): StreamSynthesizer {
  return {
    synthesize: synthesizeStreams,
  };
}

// Export utility functions for testing
export {
  synthesizeDashStreams,
  synthesizeFlvStreams,
  sortByQualityDescending,
  getQualityDescription,
};

// Export default factory
export default createStreamSynthesizer;
