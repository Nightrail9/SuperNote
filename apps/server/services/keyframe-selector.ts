import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { createId, type VideoUnderstandingConfigRecord } from './app-data-store.js';

const execFileAsync = promisify(execFile);

type SceneRange = {
  startSec: number;
  endSec: number;
};

type FrameSample = {
  timestampSec: number;
  imagePath: string;
};

type FrameMetrics = {
  lumaMean: number;
  sharpnessVariance: number;
  hash: bigint;
};

type InternalCandidate = FrameSample & FrameMetrics;

type DurationProfile = 'short' | 'medium' | 'long' | 'extra_long';

export type KeyframeRecord = {
  timestampSec: number;
  imagePath: string;
  lumaMean: number;
  sharpnessVariance: number;
};

export type KeyframeStats = {
  sceneCount: number;
  candidateCount: number;
  afterBlackFilter: number;
  afterBlurFilter: number;
  afterDedupe: number;
  finalCount: number;
  elapsedMs: number;
};

export type KeyframeSelectionResult = {
  success: boolean;
  frames: KeyframeRecord[];
  stats: KeyframeStats;
  warnings: string[];
};

export function hammingDistance(a: bigint, b: bigint): number {
  let value = a ^ b;
  let distance = 0;
  while (value > 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getDurationProfile(durationSec: number): DurationProfile {
  if (durationSec <= 8 * 60) {
    return 'short';
  }
  if (durationSec <= 25 * 60) {
    return 'medium';
  }
  if (durationSec <= 60 * 60) {
    return 'long';
  }
  return 'extra_long';
}

export function deriveAdaptiveConfig(
  durationSec: number,
  config: VideoUnderstandingConfigRecord,
): VideoUnderstandingConfigRecord {
  const profile = getDurationProfile(durationSec);
  if (profile === 'short') {
    return {
      ...config,
      maxFrames: Math.max(config.maxFrames, 28),
      sceneThreshold: clampNumber(config.sceneThreshold - 0.05, 0.05, 0.95),
      minSceneGapSec: clampNumber(config.minSceneGapSec - 0.5, 0.2, 30),
      dedupeHashDistance: clampNumber(config.dedupeHashDistance + 1, 1, 64),
    };
  }
  if (profile === 'medium') {
    return {
      ...config,
    };
  }
  if (profile === 'long') {
    return {
      ...config,
      maxFrames: Math.max(12, Math.floor(config.maxFrames * 0.85)),
      sceneThreshold: clampNumber(config.sceneThreshold + 0.04, 0.05, 0.95),
      minSceneGapSec: clampNumber(config.minSceneGapSec + 0.8, 0.2, 30),
    };
  }
  return {
    ...config,
    maxFrames: Math.max(10, Math.floor(config.maxFrames * 0.7)),
    sceneThreshold: clampNumber(config.sceneThreshold + 0.08, 0.05, 0.95),
    minSceneGapSec: clampNumber(config.minSceneGapSec + 1.5, 0.2, 30),
  };
}

export interface KeyframeSelector {
  select(
    videoPath: string,
    config: VideoUnderstandingConfigRecord,
    options?: { signal?: AbortSignal },
  ): Promise<KeyframeSelectionResult>;
}

export class DefaultKeyframeSelector implements KeyframeSelector {
  private ffmpegBin: string;
  private ffprobeBin: string;

  constructor(options?: { ffmpegBin?: string; ffprobeBin?: string }) {
    const bundledFfmpeg = path.resolve('tools', 'ffmpeg', 'bin', 'ffmpeg.exe');
    const bundledFfprobe = path.resolve('tools', 'ffmpeg', 'bin', 'ffprobe.exe');
    this.ffmpegBin =
      options?.ffmpegBin ?? process.env.FFMPEG_BIN ?? (fs.existsSync(bundledFfmpeg) ? bundledFfmpeg : 'ffmpeg');
    this.ffprobeBin =
      options?.ffprobeBin ?? process.env.FFPROBE_BIN ?? (fs.existsSync(bundledFfprobe) ? bundledFfprobe : 'ffprobe');
  }

  async select(
    videoPath: string,
    config: VideoUnderstandingConfigRecord,
    options?: { signal?: AbortSignal },
  ): Promise<KeyframeSelectionResult> {
    const startedAt = Date.now();
    const warnings: string[] = [];
    const fallbackStats = this.createEmptyStats(Date.now() - startedAt);

    const tempDir = path.join(path.dirname(videoPath), `frames_${createId('tmp')}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const durationSec = await this.probeDurationSec(videoPath, options?.signal);
      const adaptiveConfig = deriveAdaptiveConfig(durationSec, config);
      const durationProfile = getDurationProfile(durationSec);
      warnings.push(`KEYFRAME_WARN_ADAPTIVE_PROFILE:${durationProfile}`);

      const sceneBoundaries = await this.detectSceneBoundaries(
        videoPath,
        adaptiveConfig.sceneThreshold,
        adaptiveConfig.minSceneGapSec,
        options?.signal,
      );
      const scenes = this.buildScenes(durationSec, sceneBoundaries, adaptiveConfig.minSceneGapSec);
      if (sceneBoundaries.length === 0) {
        warnings.push('KEYFRAME_WARN_SCENE_EMPTY_FALLBACK_UNIFORM');
      }

      const candidates = await this.collectSceneCandidates(videoPath, scenes, adaptiveConfig, tempDir, options?.signal);
      const candidateCount = candidates.length;

      const afterBlack = candidates.filter((item) => item.lumaMean >= adaptiveConfig.blackFrameLumaThreshold);
      const afterBlackFilter = afterBlack.length;

      const afterBlur = afterBlack.filter((item) => item.sharpnessVariance >= adaptiveConfig.blurVarianceThreshold);
      const afterBlurFilter = afterBlur.length;

      const deduped = this.dedupeCandidates(afterBlur, adaptiveConfig.dedupeHashDistance);
      const afterDedupe = deduped.length;

      const finalFrames = this.limitByBudget(deduped, adaptiveConfig.maxFrames).map((item) => ({
        timestampSec: item.timestampSec,
        imagePath: item.imagePath,
        lumaMean: item.lumaMean,
        sharpnessVariance: item.sharpnessVariance,
      }));

      return {
        success: true,
        frames: finalFrames,
        warnings,
        stats: {
          sceneCount: scenes.length,
          candidateCount,
          afterBlackFilter,
          afterBlurFilter,
          afterDedupe,
          finalCount: finalFrames.length,
          elapsedMs: Date.now() - startedAt,
        },
      };
    } catch (error) {
      warnings.push(`KEYFRAME_WARN_PIPELINE_FAILED:${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        frames: [],
        warnings,
        stats: fallbackStats,
      };
    } finally {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        warnings.push('KEYFRAME_WARN_TEMP_CLEANUP_FAILED');
      }
    }
  }

  private createEmptyStats(elapsedMs: number): KeyframeStats {
    return {
      sceneCount: 0,
      candidateCount: 0,
      afterBlackFilter: 0,
      afterBlurFilter: 0,
      afterDedupe: 0,
      finalCount: 0,
      elapsedMs,
    };
  }

  private async probeDurationSec(videoPath: string, signal?: AbortSignal): Promise<number> {
    const { stdout } = await execFileAsync(this.ffprobeBin, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nokey=1:noprint_wrappers=1',
      videoPath,
    ], { signal });
    const value = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('ffprobe returned invalid duration');
    }
    return value;
  }

  private async detectSceneBoundaries(
    videoPath: string,
    sceneThreshold: number,
    minSceneGapSec: number,
    signal?: AbortSignal,
  ): Promise<number[]> {
    const filter = `select='gt(scene,${sceneThreshold.toFixed(3)})',showinfo`;
    const { stderr } = await execFileAsync(this.ffmpegBin, [
      '-hide_banner',
      '-v',
      'info',
      '-i',
      videoPath,
      '-vf',
      filter,
      '-vsync',
      'vfr',
      '-f',
      'null',
      '-',
    ], { signal });

    const matches = Array.from(stderr.matchAll(/pts_time:([0-9]+(?:\.[0-9]+)?)/g));
    const rawTimes = matches
      .map((item) => Number.parseFloat(item[1] ?? 'NaN'))
      .filter((item) => Number.isFinite(item) && item >= 0)
      .sort((a, b) => a - b);

    const deduped: number[] = [];
    for (const item of rawTimes) {
      const last = deduped[deduped.length - 1];
      if (last === undefined || item - last >= minSceneGapSec) {
        deduped.push(item);
      }
    }
    return deduped;
  }

  private buildScenes(durationSec: number, boundaries: number[], minSceneGapSec: number): SceneRange[] {
    if (boundaries.length === 0) {
      return this.buildUniformScenes(durationSec, minSceneGapSec);
    }

    const scenes: SceneRange[] = [];
    let cursor = 0;
    for (const boundary of boundaries) {
      if (boundary - cursor < minSceneGapSec) {
        continue;
      }
      scenes.push({ startSec: cursor, endSec: Math.min(boundary, durationSec) });
      cursor = boundary;
    }
    if (durationSec - cursor >= 0.1) {
      scenes.push({ startSec: cursor, endSec: durationSec });
    }
    return scenes.length > 0 ? scenes : this.buildUniformScenes(durationSec, minSceneGapSec);
  }

  private buildUniformScenes(durationSec: number, minSceneGapSec: number): SceneRange[] {
    const chunk = Math.max(minSceneGapSec * 2, 8);
    const sceneCount = Math.max(1, Math.ceil(durationSec / chunk));
    const scenes: SceneRange[] = [];
    for (let index = 0; index < sceneCount; index++) {
      const startSec = (durationSec / sceneCount) * index;
      const endSec = Math.min(durationSec, (durationSec / sceneCount) * (index + 1));
      scenes.push({ startSec, endSec });
    }
    return scenes;
  }

  private async collectSceneCandidates(
    videoPath: string,
    scenes: SceneRange[],
    config: VideoUnderstandingConfigRecord,
    tempDir: string,
    signal?: AbortSignal,
  ): Promise<InternalCandidate[]> {
    const all: InternalCandidate[] = [];

    for (const scene of scenes) {
      const timestamps = this.generateSceneTimestamps(scene, config.perSceneMax);
      const perScene: InternalCandidate[] = [];

      for (const timestampSec of timestamps) {
        const imagePath = path.join(tempDir, `f_${Math.round(timestampSec * 1000)}.jpg`);
        await this.extractFrame(videoPath, timestampSec, imagePath, config.extractWidth, signal);
        const metrics = await this.computeMetrics(imagePath, signal);
        perScene.push({ timestampSec, imagePath, ...metrics });
      }

      perScene.sort((a, b) => this.rankScore(b) - this.rankScore(a));
      all.push(...perScene.slice(0, config.perSceneMax));
    }

    all.sort((a, b) => a.timestampSec - b.timestampSec);
    return all;
  }

  private generateSceneTimestamps(scene: SceneRange, perSceneMax: number): number[] {
    const duration = Math.max(scene.endSec - scene.startSec, 0.5);
    const mid = scene.startSec + duration / 2;
    if (perSceneMax <= 1) {
      return [mid];
    }
    const p10 = scene.startSec + duration * 0.15;
    const p85 = scene.startSec + duration * 0.85;
    return Array.from(new Set([mid, p10, p85].map((item) => Number.parseFloat(item.toFixed(3)))));
  }

  private async extractFrame(
    videoPath: string,
    timestampSec: number,
    outputPath: string,
    width: number,
    signal?: AbortSignal,
  ): Promise<void> {
    await execFileAsync(this.ffmpegBin, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      timestampSec.toFixed(3),
      '-i',
      videoPath,
      '-frames:v',
      '1',
      '-vf',
      `scale=${width}:-2`,
      '-y',
      outputPath,
    ], { signal });
  }

  private async computeMetrics(imagePath: string, signal?: AbortSignal): Promise<FrameMetrics> {
    const gray64 = await this.decodeGrayPixels(imagePath, 64, 64, signal);
    const lumaMean = this.mean(gray64);
    const sharpnessVariance = this.laplacianVariance(gray64, 64, 64);
    const grayHash = await this.decodeGrayPixels(imagePath, 9, 8, signal);
    const hash = this.dHash(grayHash, 9, 8);
    return { lumaMean, sharpnessVariance, hash };
  }

  private async decodeGrayPixels(imagePath: string, width: number, height: number, signal?: AbortSignal): Promise<Buffer> {
    const { stdout } = await execFileAsync(this.ffmpegBin, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      imagePath,
      '-vf',
      `scale=${width}:${height}:flags=bilinear,format=gray`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-',
    ],
    {
      encoding: 'buffer',
      maxBuffer: 1024 * 1024 * 8,
      signal,
    });

    if (!Buffer.isBuffer(stdout) || stdout.length < width * height) {
      throw new Error(`unable to decode frame pixels: ${imagePath}`);
    }
    return stdout.subarray(0, width * height);
  }

  private mean(buffer: Buffer): number {
    let total = 0;
    for (let index = 0; index < buffer.length; index++) {
      total += buffer[index] ?? 0;
    }
    return total / Math.max(buffer.length, 1);
  }

  private laplacianVariance(buffer: Buffer, width: number, height: number): number {
    const values: number[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const center = buffer[y * width + x] ?? 0;
        const up = buffer[(y - 1) * width + x] ?? 0;
        const down = buffer[(y + 1) * width + x] ?? 0;
        const left = buffer[y * width + (x - 1)] ?? 0;
        const right = buffer[y * width + (x + 1)] ?? 0;
        const lap = 4 * center - up - down - left - right;
        values.push(lap);
      }
    }
    if (values.length === 0) {
      return 0;
    }
    const avg = values.reduce((sum, item) => sum + item, 0) / values.length;
    const variance = values.reduce((sum, item) => sum + (item - avg) ** 2, 0) / values.length;
    return variance;
  }

  private dHash(buffer: Buffer, width: number, height: number): bigint {
    let hash = 0n;
    let bit = 0n;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width - 1; x++) {
        const left = buffer[row + x] ?? 0;
        const right = buffer[row + x + 1] ?? 0;
        if (left > right) {
          hash |= 1n << bit;
        }
        bit += 1n;
      }
    }
    return hash;
  }

  private rankScore(item: InternalCandidate): number {
    const lumaPenalty = item.lumaMean < 32 ? (32 - item.lumaMean) * 8 : 0;
    return item.sharpnessVariance - lumaPenalty;
  }

  private dedupeCandidates(candidates: InternalCandidate[], threshold: number): InternalCandidate[] {
    const result: InternalCandidate[] = [];
    for (const item of candidates) {
      const prev = result[result.length - 1];
      if (!prev) {
        result.push(item);
        continue;
      }
      const distance = hammingDistance(item.hash, prev.hash);
      if (distance >= threshold) {
        result.push(item);
      }
    }
    return result;
  }

  private limitByBudget(candidates: InternalCandidate[], maxFrames: number): InternalCandidate[] {
    if (candidates.length <= maxFrames) {
      return candidates;
    }
    const result: InternalCandidate[] = [];
    for (let index = 0; index < maxFrames; index++) {
      const position = Math.floor((index * (candidates.length - 1)) / Math.max(maxFrames - 1, 1));
      const picked = candidates[position];
      if (picked) {
        result.push(picked);
      }
    }
    return result;
  }
}

export function createKeyframeSelector(): KeyframeSelector {
  return new DefaultKeyframeSelector();
}
