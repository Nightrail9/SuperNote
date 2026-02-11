/**
 * 总结流水线服务
 *
 * 串联解析、下载、转写、笔记文本生成与模型整理。
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  loadVideoProcessorConfig,
} from './config-loader.js';
import { loadConfig } from '../config.js';
import { getAppData } from './app-data-store.js';
import {
  DefaultBilibiliVideoParser,
  DefaultVideoDownloader,
  generateTempFilePath,
  generateOSSKey,
  buildDisplayTitle,
  type BilibiliVideoParser,
  type VideoDownloader,
  type VideoInfo,
} from './pipeline-utils.js';
import { createOSSUploader, type OSSUploader, type OSSUploaderConfig } from './oss-uploader.js';
import { createTingwuClient, type TingwuClient, type TingwuConfig } from './tingwu-client.js';
import { createMarkdownGenerator, type MarkdownGenerator } from './markdown-generator.js';
import { DefaultAIOrganizer, type AIOrganizer } from './ai-organizer.js';

/** 流水线配置 */
export interface SummaryPipelineConfig {
  /** 听悟 App Key */
  tingwuAppKey: string;
  /** 听悟接口地址（可选） */
  tingwuEndpoint?: string;
  /** 阿里云 Access Key ID */
  aliyunAccessKeyId: string;
  /** 阿里云 Access Key Secret */
  aliyunAccessKeySecret: string;
  /** OSS 区域 */
  ossRegion: string;
  /** OSS Bucket */
  ossBucket: string;
  /** 临时目录 */
  tempDir: string;
  /** Bilibili SESSDATA（可选） */
  sessdata?: string;
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
  execute(url: string, aiConfig?: AIConfig): Promise<SummaryResult>;
}

/** 可注入依赖（测试用） */
export interface SummaryPipelineDeps {
  videoParser?: BilibiliVideoParser;
  downloader?: VideoDownloader;
  ossUploader?: OSSUploader;
  tingwuClient?: TingwuClient;
  markdownGenerator?: MarkdownGenerator;
  aiOrganizer?: AIOrganizer;
}

/** 默认流水线实现 */
export class DefaultSummaryPipeline implements SummaryPipeline {
  private config: SummaryPipelineConfig;
  private videoParser: BilibiliVideoParser;
  private downloader: VideoDownloader;
  private ossUploader: OSSUploader;
  private tingwuClient: TingwuClient;
  private markdownGenerator: MarkdownGenerator;
  private aiOrganizer: AIOrganizer;

  constructor(config: SummaryPipelineConfig, deps?: SummaryPipelineDeps) {
    this.config = config;
    this.videoParser = deps?.videoParser ?? new DefaultBilibiliVideoParser();
    this.downloader = deps?.downloader ?? new DefaultVideoDownloader();

    const ossConfig: OSSUploaderConfig = {
      region: config.ossRegion,
      accessKeyId: config.aliyunAccessKeyId,
      accessKeySecret: config.aliyunAccessKeySecret,
      bucket: config.ossBucket,
    };
    this.ossUploader = deps?.ossUploader ?? createOSSUploader(ossConfig);

    const tingwuConfig: TingwuConfig = {
      appKey: config.tingwuAppKey,
      endpoint: config.tingwuEndpoint,
      accessKeyId: config.aliyunAccessKeyId,
      accessKeySecret: config.aliyunAccessKeySecret,
    };
    this.tingwuClient = deps?.tingwuClient ?? createTingwuClient(tingwuConfig);
    this.markdownGenerator = deps?.markdownGenerator ?? createMarkdownGenerator();
    this.aiOrganizer = deps?.aiOrganizer ?? new DefaultAIOrganizer();
  }

  /** 执行整条流水线 */
  async execute(url: string, aiConfig?: AIConfig): Promise<SummaryResult> {
    let tempFilePath: string | null = null;

    try {
      // 阶段 1：解析视频信息
      let videoInfo: VideoInfo;
      try {
        const parsed = await this.videoParser.parseVideo(url, 1);
        if (!parsed) {
          return this.createError('parse', 'PARSE_FAILED', '无法解析视频信息，请检查链接是否正确');
        }
        videoInfo = parsed;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.createError('parse', 'PARSE_FAILED', message);
      }

      // 阶段 2：下载视频
      tempFilePath = generateTempFilePath(this.config.tempDir, 1);
      try {
        // 确保临时目录存在
        const tempDir = path.dirname(tempFilePath);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        await this.downloader.download(videoInfo.videoUrl, tempFilePath, {
          referer: 'https://www.bilibili.com',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.createError('download', 'DOWNLOAD_FAILED', message);
      }

      // 阶段 3：上传 OSS
      let ossUrl: string;
      try {
        const ossKey = generateOSSKey(1);
        ossUrl = await this.ossUploader.upload(tempFilePath, ossKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.createError('upload', 'UPLOAD_FAILED', message);
      }

      // 上传成功后清理临时文件
      this.cleanupTempFile(tempFilePath);
      tempFilePath = null;

      // 阶段 4：转写并获取 PPT 提取地址
      let pptExtractionUrl: string;
      try {
        const taskId = await this.tingwuClient.createTask(ossUrl);
        const result = await this.tingwuClient.waitForCompletion(taskId);
        if (!result.pptExtractionUrl) {
          return this.createError('transcribe', 'TRANSCRIBE_FAILED', 'PPT 提取结果不可用');
        }
        pptExtractionUrl = result.pptExtractionUrl;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.createError('transcribe', 'TRANSCRIBE_FAILED', message);
      }

      // 阶段 5：生成笔记文本
      let markdown: string;
      let displayTitle: string;
      try {
        displayTitle = buildDisplayTitle(videoInfo.title, videoInfo.part, videoInfo.partTitle);
        const pptData = await this.markdownGenerator.fetchPPTData(pptExtractionUrl);
        markdown = this.markdownGenerator.formatMarkdown(displayTitle, pptData);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.createError('generate', 'GENERATE_FAILED', message);
      }

      if (!aiConfig) {
        return {
          success: true,
          title: displayTitle,
          markdown,
        };
      }

      // 阶段 6：调用模型整理
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
        const message = error instanceof Error ? error.message : String(error);
        return this.createError('ai_call', 'AI_ERROR', message);
      }

      return {
        success: true,
        title: displayTitle,
        markdown,
        summary,
      };
    } finally {
      // 任意失败都要清理临时文件
      if (tempFilePath) {
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
  const envConfig = loadVideoProcessorConfig();
  const integrations = getAppData().settings.integrations;

  const serverConfig = loadConfig();

  const tingwuAppKey = integrations.tingwu.appKey?.trim() || envConfig.tingwuAppKey;
  const tingwuEndpoint = integrations.tingwu.endpoint?.trim() || undefined;
  const aliyunAccessKeyId = integrations.oss.accessKeyId?.trim() || envConfig.aliyunAccessKeyId;
  const aliyunAccessKeySecret = integrations.oss.accessKeySecret?.trim() || envConfig.aliyunAccessKeySecret;
  const ossRegion = integrations.oss.region?.trim() || envConfig.ossRegion;
  const ossBucket = integrations.oss.bucket?.trim() || envConfig.ossBucket;

  const missingFields: string[] = [];
  if (!tingwuAppKey) {
    missingFields.push('TINGWU_APP_KEY');
  }
  if (!aliyunAccessKeyId) {
    missingFields.push('ALIYUN_ACCESS_KEY_ID');
  }
  if (!aliyunAccessKeySecret) {
    missingFields.push('ALIYUN_ACCESS_KEY_SECRET');
  }
  if (!ossBucket) {
    missingFields.push('OSS_BUCKET');
  }
  if (missingFields.length > 0) {
    throw new Error(
      `Missing required configuration fields: ${missingFields.join(', ')}. Configure them in integrations settings or environment variables.`
    );
  }

  const tempDir = path.resolve('temp');

  return {
    tingwuAppKey,
    tingwuEndpoint,
    aliyunAccessKeyId,
    aliyunAccessKeySecret,
    ossRegion,
    ossBucket,
    tempDir,
    sessdata: serverConfig.sessdata,
  };
}

/** 创建流水线实例 */
export function createSummaryPipeline(
  config: SummaryPipelineConfig,
  deps?: SummaryPipelineDeps,
): SummaryPipeline {
  return new DefaultSummaryPipeline(config, deps);
}
