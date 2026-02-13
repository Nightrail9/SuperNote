/**
 * FFmpeg Path Resolution Utilities
 *
 * Centralized FFmpeg binary path resolution with bundled fallback support.
 */

import * as fs from 'fs';
import * as path from 'path';

const BUNDLED_FFMPEG_PATH = path.resolve('tools', 'ffmpeg', 'bin', 'ffmpeg.exe');
const BUNDLED_FFPROBE_PATH = path.resolve('tools', 'ffmpeg', 'bin', 'ffprobe.exe');

/**
 * Resolve FFmpeg binary path with fallback chain:
 * 1. Preferred path (from config)
 * 2. Environment variable FFMPEG_BIN
 * 3. Bundled binary (if exists)
 * 4. System 'ffmpeg' command
 */
export function resolveFfmpegBin(preferredPath?: string): string {
  if (preferredPath?.trim()) {
    return preferredPath.trim();
  }

  const envPath = process.env.FFMPEG_BIN?.trim();
  if (envPath) {
    return envPath;
  }

  if (fs.existsSync(BUNDLED_FFMPEG_PATH)) {
    return BUNDLED_FFMPEG_PATH;
  }

  return 'ffmpeg';
}

/**
 * Resolve FFprobe binary path with fallback chain:
 * 1. Preferred path (from config)
 * 2. Environment variable FFPROBE_BIN
 * 3. Bundled binary (if exists)
 * 4. System 'ffprobe' command
 */
export function resolveFfprobeBin(preferredPath?: string): string {
  if (preferredPath?.trim()) {
    return preferredPath.trim();
  }

  const envPath = process.env.FFPROBE_BIN?.trim();
  if (envPath) {
    return envPath;
  }

  if (fs.existsSync(BUNDLED_FFPROBE_PATH)) {
    return BUNDLED_FFPROBE_PATH;
  }

  return 'ffprobe';
}

/**
 * Check if bundled FFmpeg is available
 */
export function hasBundledFfmpeg(): boolean {
  return fs.existsSync(BUNDLED_FFMPEG_PATH);
}

/**
 * Check if bundled FFprobe is available
 */
export function hasBundledFfprobe(): boolean {
  return fs.existsSync(BUNDLED_FFPROBE_PATH);
}
