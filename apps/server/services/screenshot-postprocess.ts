import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { resolveFfmpegBin } from '../utils/ffmpeg-resolver.js';
import { getErrorMessage } from '../utils/http-error.js';

const execFileAsync = promisify(execFile);
const DEFAULT_SCREENSHOT_CONCURRENCY = 4;
const MAX_SCREENSHOT_CONCURRENCY = 8;

const SCREENSHOT_MARKER_PATTERN = /\*?Screenshot-\[(\d{2}):(\d{2})\]\*?/g;

function parseMarkerTimestamps(markdown: string): Array<{ marker: string; seconds: number }> {
  const matches = markdown.matchAll(SCREENSHOT_MARKER_PATTERN);
  const result: Array<{ marker: string; seconds: number }> = [];
  for (const match of matches) {
    const mm = Number.parseInt(match[1] ?? '', 10);
    const ss = Number.parseInt(match[2] ?? '', 10);
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) {
      continue;
    }
    const marker = match[0] ?? '';
    if (!marker) {
      continue;
    }
    result.push({ marker, seconds: mm * 60 + ss });
  }
  return result;
}

async function extractScreenshot(videoPath: string, outputPath: string, seconds: number, preferCuda: boolean): Promise<void> {
  const ffmpegBin = resolveFfmpegBin();
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    seconds.toFixed(3),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    '-y',
    outputPath,
  ];

  if (!preferCuda) {
    await execFileAsync(ffmpegBin, args, { windowsHide: true });
    return;
  }

  try {
    await execFileAsync(ffmpegBin, ['-hwaccel', 'cuda', ...args], { windowsHide: true });
  } catch {
    await execFileAsync(ffmpegBin, args, { windowsHide: true });
  }
}

export async function replaceScreenshotMarkers(options: {
  markdown: string;
  videoPath: string;
  taskId: string;
  preferCuda?: boolean;
}): Promise<{ markdown: string; replaced: number; warnings: string[] }> {
  const timestamps = parseMarkerTimestamps(options.markdown);
  if (timestamps.length === 0) {
    return { markdown: options.markdown, replaced: 0, warnings: [] };
  }

  // 保存到 public 目录供Web访问
  const publicDir = path.resolve('data', 'public', 'screenshots', options.taskId);
  // 保存到 data 目录作为数据备份
  const dataDir = path.resolve('data', 'screenshots', options.taskId);
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  let markdown = options.markdown;
  const warnings: string[] = [];

  const rawConcurrency = Number.parseInt(process.env.SCREENSHOT_CONCURRENCY || '', 10);
  const configuredConcurrency = Number.isFinite(rawConcurrency) ? rawConcurrency : DEFAULT_SCREENSHOT_CONCURRENCY;
  const concurrency = Math.max(1, Math.min(MAX_SCREENSHOT_CONCURRENCY, configuredConcurrency));

  const replacements = new Array<string | null>(timestamps.length).fill(null);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= timestamps.length) {
        return;
      }
      const item = timestamps[currentIndex];
      if (!item) {
        continue;
      }
      const filename = `screenshot_${String(currentIndex + 1).padStart(3, '0')}_${item.seconds}.jpg`;
      const publicPath = path.join(publicDir, filename);
      const dataPath = path.join(dataDir, filename);
      const publicUrl = `/static/screenshots/${options.taskId}/${filename}`;
      try {
        await extractScreenshot(options.videoPath, publicPath, item.seconds, Boolean(options.preferCuda));
        fs.copyFileSync(publicPath, dataPath);
        replacements[currentIndex] = `![](${publicUrl})`;
      } catch (error) {
        const message = getErrorMessage(error);
        warnings.push(`截图提取失败（${item.marker}）：${message}`);
      }
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, timestamps.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  let replaced = 0;
  for (let index = 0; index < timestamps.length; index++) {
    const item = timestamps[index];
    const replacement = replacements[index];
    if (!item || !replacement) {
      continue;
    }
    markdown = markdown.replace(item.marker, replacement);
    replaced += 1;
  }

  return { markdown, replaced, warnings };
}
