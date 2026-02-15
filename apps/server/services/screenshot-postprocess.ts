import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { resolveFfmpegBin } from '../utils/ffmpeg-resolver.js';
import { getErrorMessage } from '../utils/http-error.js';

const execFileAsync = promisify(execFile);

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

async function extractScreenshot(videoPath: string, outputPath: string, seconds: number): Promise<void> {
  const ffmpegBin = resolveFfmpegBin();
  await execFileAsync(
    ffmpegBin,
    [
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
    ],
    { windowsHide: true },
  );
}

export async function replaceScreenshotMarkers(options: {
  markdown: string;
  videoPath: string;
  taskId: string;
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
  let replaced = 0;
  const warnings: string[] = [];

  for (let index = 0; index < timestamps.length; index++) {
    const item = timestamps[index];
    if (!item) {
      continue;
    }
    const filename = `screenshot_${String(index + 1).padStart(3, '0')}_${item.seconds}.jpg`;
    const publicPath = path.join(publicDir, filename);
    const dataPath = path.join(dataDir, filename);
    const publicUrl = `/static/screenshots/${options.taskId}/${filename}`;
    try {
      // 提取截图到 public 目录供Web访问
      await extractScreenshot(options.videoPath, publicPath, item.seconds);
      // 同时复制一份到 data 目录作为数据备份
      fs.copyFileSync(publicPath, dataPath);
      markdown = markdown.replace(item.marker, `![](${publicUrl})`);
      replaced += 1;
    } catch (error) {
      const message = getErrorMessage(error);
      warnings.push(`截图提取失败（${item.marker}）：${message}`);
    }
  }

  return { markdown, replaced, warnings };
}
