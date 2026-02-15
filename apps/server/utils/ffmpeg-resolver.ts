import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { getProjectRoot, resolveProjectPath } from './path-resolver.js';

// ============================================================================
// FFmpeg 路径解析工具
// ============================================================================
// 基于项目根目录解析 FFmpeg 可执行文件路径，不依赖当前工作目录(CWD)

// 项目根目录
const PROJECT_ROOT = getProjectRoot();

// 内置 FFmpeg 目录
const BUNDLED_FFMPEG_DIR = path.join(PROJECT_ROOT, 'tools', 'ffmpeg', 'bin');

/**
 * 判断是否为 Windows 平台
 */
function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * 获取可执行文件后缀
 */
function getExecutableExt(): string {
  return isWindows() ? '.exe' : '';
}

/**
 * 解析 FFmpeg 可执行文件路径
 *
 * 优先级：
 * 1. 用户显式配置的路径
 * 2. FFMPEG_BIN 环境变量
 * 3. 项目内置的 tools/ffmpeg/bin/ffmpeg.exe
 * 4. 系统 PATH 中的 ffmpeg 命令
 *
 * @param userConfigPath - 用户配置的路径（可选）
 * @returns FFmpeg 可执行文件的绝对路径或命令名
 *
 * @example
 * ```typescript
 * // 使用内置 FFmpeg（推荐，无需配置）
 * const ffmpeg = resolveFfmpegBin();
 *
 * // 使用用户自定义路径
 * const ffmpeg = resolveFfmpegBin('/usr/local/bin/ffmpeg');
 * ```
 */
export function resolveFfmpegBin(userConfigPath?: string): string {
  // 1. 用户配置的路径
  if (userConfigPath?.trim()) {
    return resolveProjectPath(userConfigPath.trim());
  }

  // 2. 环境变量
  if (process.env.FFMPEG_BIN?.trim()) {
    return resolveProjectPath(process.env.FFMPEG_BIN.trim());
  }

  // 3. 内置 FFmpeg（基于项目根目录）
  const bundledPath = path.join(BUNDLED_FFMPEG_DIR, `ffmpeg${getExecutableExt()}`);
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  // 4. 回退到系统 PATH
  return 'ffmpeg';
}

/**
 * 解析 FFprobe 可执行文件路径
 *
 * 优先级：
 * 1. 用户显式配置的路径
 * 2. FFPROBE_BIN 环境变量
 * 3. 从 FFmpeg 所在目录推断（ffmpeg.exe 旁边应该有 ffprobe.exe）
 * 4. 项目内置的 tools/ffmpeg/bin/ffprobe.exe
 * 5. 系统 PATH 中的 ffprobe 命令
 *
 * @param userConfigPath - 用户配置的路径（可选）
 * @returns FFprobe 可执行文件的绝对路径或命令名
 *
 * @example
 * ```typescript
 * const ffprobe = resolveFfprobeBin();
 * ```
 */
export function resolveFfprobeBin(userConfigPath?: string): string {
  // 1. 用户配置的路径
  if (userConfigPath?.trim()) {
    return resolveProjectPath(userConfigPath.trim());
  }

  // 2. 环境变量
  if (process.env.FFPROBE_BIN?.trim()) {
    return resolveProjectPath(process.env.FFPROBE_BIN.trim());
  }

  // 3. 尝试从 FFmpeg 路径推断 ffprobe 路径
  const ffmpegPath = resolveFfmpegBin();
  if (ffmpegPath !== 'ffmpeg') {
    const ffmpegDir = path.dirname(ffmpegPath);
    const inferredFfprobe = path.join(ffmpegDir, `ffprobe${getExecutableExt()}`);
    if (fs.existsSync(inferredFfprobe)) {
      return inferredFfprobe;
    }
  }

  // 4. 内置 FFprobe
  const bundledPath = path.join(BUNDLED_FFMPEG_DIR, `ffprobe${getExecutableExt()}`);
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  // 5. 回退到系统 PATH
  return 'ffprobe';
}

/**
 * 检查内置 FFmpeg 是否可用
 *
 * @returns 如果 tools/ffmpeg/bin/ 目录存在且包含可执行文件则返回 true
 */
export function isBundledFfmpegAvailable(): boolean {
  const ffmpegPath = path.join(BUNDLED_FFMPEG_DIR, `ffmpeg${getExecutableExt()}`);
  const ffprobePath = path.join(BUNDLED_FFMPEG_DIR, `ffprobe${getExecutableExt()}`);
  return fs.existsSync(ffmpegPath) && fs.existsSync(ffprobePath);
}

/**
 * 获取内置 FFmpeg 信息
 *
 * @returns 包含路径和版本信息的配置对象，如果内置 FFmpeg 不存在则返回 null
 */
export function getBundledFfmpegInfo(): {
  dir: string;
  ffmpeg: string;
  ffprobe: string;
} | null {
  if (!isBundledFfmpegAvailable()) {
    return null;
  }

  return {
    dir: BUNDLED_FFMPEG_DIR,
    ffmpeg: path.join(BUNDLED_FFMPEG_DIR, `ffmpeg${getExecutableExt()}`),
    ffprobe: path.join(BUNDLED_FFMPEG_DIR, `ffprobe${getExecutableExt()}`),
  };
}
