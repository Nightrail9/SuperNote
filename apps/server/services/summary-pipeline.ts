/**
 * 总结流水线服务
 *
 * 串联解析、下载、转写、笔记文本生成与模型整理。
 */

import * as fs from 'fs';
import * as path from 'path';

import { loadConfig } from '../config.js';
import { DefaultAIOrganizer, type AIOrganizer } from './ai-organizer.js';
import { type LocalTranscriberConfigRecord, type VideoUnderstandingConfigRecord } from './app-data-store.js';
import { logDiagnostic, logDiagnosticError } from './diagnostic-logger.js';
import {
  createKeyframeSelector,
  type KeyframeRecord,
  type KeyframeSelector,
  type KeyframeStats,
} from './keyframe-selector.js';
import { createLocalTranscriber, toTranscriptMarkdown, type LocalTranscriber } from './local-transcriber.js';
import {
  DefaultBilibiliVideoParser,
  DefaultVideoDownloader,
  generateTempFilePath,
  buildDisplayTitle,
  type BilibiliVideoParser,
  type VideoDownloader,
  type VideoInfo,
} from './pipeline-utils.js';
import { getLocalTranscriber, getVideoUnderstanding } from './settings-store/index.js';
import { getErrorMessage } from '../utils/http-error.js';

/** 流水线配置 */
export interface SummaryPipelineConfig {
  /** 临时目录 */
  tempDir: string;
  /** Bilibili SESSDATA（可选） */
  sessdata?: string;
  /** 本地转写配置 */
  localTranscriber: LocalTranscriberConfigRecord;
  /** 关键帧提取配置 */
  videoUnderstanding: VideoUnderstandingConfigRecord;
}

/** 流水线执行结果 */
export interface SummaryResult {
  success: boolean;
  /** 视频标题 */
  title?: string;
  /** Markdown 内容 */
  markdown?: string;
  /** AI 整理结果 */
  summary?: string;
  /** 关键帧结果 */
  keyframes?: KeyframeRecord[];
  /** 关键帧统计 */
  keyframeStats?: KeyframeStats;
  /** 非致命告警 */
  warnings?: string[];
  /** 保留的视频临时文件路径（仅 retainTempFile 开启时返回） */
  videoFilePath?: string;
  /** 失败信息 */
  error?: {
    stage: string;
    code: string;
    message: string;
  };
}

/** 请求级 AI 配置 */
export interface AIConfig {
  apiUrl: string;
  apiKey: string;
  prompt: string;
}

/** 流水线接口 */
export interface SummaryPipeline {
  execute(url: string, aiConfig?: AIConfig, options?: SummaryExecuteOptions): Promise<SummaryResult>;
}

export interface SummaryExecuteOptions {
  onProgress?: (payload: { stage: string; progress: number; message: string }) => void;
  signal?: AbortSignal;
  retainTempFile?: boolean;
  enableKeyframes?: boolean;
}

/** 可注入依赖（测试用） */
export interface SummaryPipelineDeps {
  videoParser?: BilibiliVideoParser;
  downloader?: VideoDownloader;
  localTranscriber?: LocalTranscriber;
  aiOrganizer?: AIOrganizer;
  keyframeSelector?: KeyframeSelector;
}

/** 默认流水线实现 */
export class DefaultSummaryPipeline implements SummaryPipeline {
  private config: SummaryPipelineConfig;
  private videoParser: BilibiliVideoParser;
  private downloader: VideoDownloader;
  private localTranscriber: LocalTranscriber;
  private aiOrganizer: AIOrganizer;
  private keyframeSelector: KeyframeSelector;

  constructor(config: SummaryPipelineConfig, deps?: SummaryPipelineDeps) {
    this.config = config;
    this.videoParser = deps?.videoParser ?? new DefaultBilibiliVideoParser();
    this.downloader = deps?.downloader ?? new DefaultVideoDownloader();
    this.localTranscriber = deps?.localTranscriber ?? createLocalTranscriber();
    this.aiOrganizer = deps?.aiOrganizer ?? new DefaultAIOrganizer();
    this.keyframeSelector = deps?.keyframeSelector ?? createKeyframeSelector();
  }

  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /** 执行整条流水线 */
  async execute(url: string, aiConfig?: AIConfig, options?: SummaryExecuteOptions): Promise<SummaryResult> {
    let tempFilePath: string | null = null;
    const startedAt = Date.now();
    const warnings: string[] = [];
    let keyframes: KeyframeRecord[] = [];
    let keyframeStats: KeyframeStats | undefined;

    try {
      logDiagnostic('info', 'summary-pipeline', 'pipeline_started', {
        url,
        tempDir: this.config.tempDir,
        localAsrModel: this.config.localTranscriber.model,
        localAsrTimeoutMs: this.config.localTranscriber.timeoutMs,
        keyframeEnabled: this.config.videoUnderstanding.enabled,
      });
      options?.onProgress?.({ stage: 'parse', progress: 0.05, message: '正在解析视频信息' });
      // 阶段 1：解析视频信息
      let videoInfo: VideoInfo;
      try {
        const parsed = await this.videoParser.parseVideo(url, 1);
        if (!parsed) {
          return this.createError('parse', 'PARSE_FAILED', '无法解析视频信息，请检查链接是否正确');
        }
        videoInfo = parsed;
      } catch (error) {
        const message = getErrorMessage(error);
        logDiagnosticError('summary-pipeline', 'parse_failed', error, { url });
        return this.createError('parse', 'PARSE_FAILED', message);
      }

      // 阶段 2：下载视频
      tempFilePath = generateTempFilePath(this.config.tempDir, 1);
      options?.onProgress?.({ stage: 'download', progress: 0.18, message: '正在下载视频源文件' });
      try {
        // 确保临时目录存在
        const tempDir = path.dirname(tempFilePath);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        await this.downloader.download(videoInfo.videoUrl, tempFilePath, {
          referer: 'https://www.bilibili.com',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          signal: options?.signal,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        logDiagnosticError('summary-pipeline', 'download_failed', error, {
          url,
          tempFilePath,
          videoUrl: videoInfo.videoUrl,
        });
        return this.createError('download', 'DOWNLOAD_FAILED', message);
      }

      const shouldRunKeyframes = this.config.videoUnderstanding.enabled && (options?.enableKeyframes ?? true);
      if (shouldRunKeyframes) {
        options?.onProgress?.({ stage: 'extract_frames', progress: 0.38, message: '正在进行关键帧提取' });
        try {
          const keyframeResult = await this.runWithTimeout(
            this.keyframeSelector.select(tempFilePath, this.config.videoUnderstanding, { signal: options?.signal }),
            this.config.videoUnderstanding.timeoutMs,
            'keyframe stage timeout',
          );
          if (options?.signal?.aborted) {
            throw new Error('task cancelled');
          }
          keyframes = keyframeResult.frames;
          keyframeStats = keyframeResult.stats;
          if (keyframeResult.warnings.length > 0) {
            warnings.push(...keyframeResult.warnings);
          }
        } catch (error) {
          logDiagnosticError('summary-pipeline', 'keyframe_failed', error, {
            url,
            timeoutMs: this.config.videoUnderstanding.timeoutMs,
          });
          warnings.push(`KEYFRAME_WARN_STAGE_TIMEOUT_OR_FAILED:${getErrorMessage(error)}`);
        }
      }

      // 阶段 3：本地转写
      let transcriptMarkdown = '';
      const displayTitle = buildDisplayTitle(videoInfo.title, videoInfo.part, videoInfo.partTitle);
      options?.onProgress?.({ stage: 'local_transcribe', progress: 0.68, message: '正在执行本地转写' });
      try {
        const transcript = await this.runWithTimeout(
          this.localTranscriber.transcribe(tempFilePath, this.config.localTranscriber, { signal: options?.signal }),
          this.config.localTranscriber.timeoutMs,
          'local transcribe timeout',
        );
          if (options?.signal?.aborted) {
            throw new Error('task cancelled');
          }
        transcriptMarkdown = toTranscriptMarkdown(displayTitle, transcript);
      } catch (error) {
        const message = getErrorMessage(error);
        logDiagnosticError('summary-pipeline', 'local_transcribe_failed', error, {
          url,
          tempFilePath,
          timeoutMs: this.config.localTranscriber.timeoutMs,
          model: this.config.localTranscriber.model,
          device: this.config.localTranscriber.device,
        });
        return this.createError('local_transcribe', 'LOCAL_TRANSCRIBE_FAILED', message);
      }

      let retainedVideoFilePath: string | undefined;
      if (options?.retainTempFile) {
        retainedVideoFilePath = tempFilePath;
        tempFilePath = null;
      } else {
        this.cleanupTempFile(tempFilePath);
        tempFilePath = null;
      }

      // 阶段 4：生成笔记文本
      let markdown: string;
      options?.onProgress?.({ stage: 'generate', progress: 0.88, message: '正在整理转录内容' });
      try {
        markdown = transcriptMarkdown;
      } catch (error) {
        const message = getErrorMessage(error);
        return this.createError('generate', 'GENERATE_FAILED', message);
      }

      if (!aiConfig) {
        logDiagnostic('info', 'summary-pipeline', 'pipeline_completed', {
          url,
          elapsedMs: Date.now() - startedAt,
          warnings,
          hasKeyframes: keyframes.length > 0,
        });
        return {
          success: true,
          title: displayTitle,
          markdown,
          keyframes,
          keyframeStats,
          warnings,
          videoFilePath: retainedVideoFilePath,
        };
      }

      // 阶段 5：调用模型整理
      let summary: string;
      try {
        const aiResult = await this.aiOrganizer.organize(markdown, {
          apiUrl: aiConfig.apiUrl,
          apiKey: aiConfig.apiKey,
          prompt: aiConfig.prompt,
        });
        if (!aiResult.success) {
          return this.createError(
            'ai_call',
            aiResult.error?.code ?? 'AI_ERROR',
            aiResult.error?.message ?? 'AI API 调用失败',
          );
        }
        summary = aiResult.content ?? '';
      } catch (error) {
        const message = getErrorMessage(error);
        logDiagnosticError('summary-pipeline', 'ai_call_failed', error, { url });
        return this.createError('ai_call', 'AI_ERROR', message);
      }

      logDiagnostic('info', 'summary-pipeline', 'pipeline_completed', {
        url,
        elapsedMs: Date.now() - startedAt,
        warnings,
        hasKeyframes: keyframes.length > 0,
      });
      return {
        success: true,
        title: displayTitle,
        markdown,
        summary,
        keyframes,
        keyframeStats,
        warnings,
        videoFilePath: retainedVideoFilePath,
      };
    } finally {
      // 任意失败都要清理临时文件
      if (tempFilePath) {
        logDiagnostic('info', 'summary-pipeline', 'cleanup_temp_file', {
          url,
          tempFilePath,
        });
        this.cleanupTempFile(tempFilePath);
      }
    }
  }

  /** 清理临时文件（忽略错误） */
  private cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // 忽略清理异常
    }
  }

  /** 构造统一错误结果 */
  private createError(stage: string, code: string, message: string): SummaryResult {
    return {
      success: false,
      error: {
        stage,
        code,
        message,
      },
    };
  }
}

/**
 * 读取流水线配置。
 * 优先使用持久化配置，其次环境变量。
 */
export function loadSummaryPipelineConfig(): SummaryPipelineConfig {
  const localTranscriber = getLocalTranscriber();
  const videoUnderstanding = getVideoUnderstanding();

  const serverConfig = loadConfig();

  const tempDir = path.resolve('data', 'temp');

  return {
    tempDir,
    sessdata: serverConfig.sessdata,
    localTranscriber,
    videoUnderstanding,
  };
}

/** 创建流水线实例 */
export function createSummaryPipeline(
  config: SummaryPipelineConfig,
  deps?: SummaryPipelineDeps,
): SummaryPipeline {
  return new DefaultSummaryPipeline(config, deps);
}
