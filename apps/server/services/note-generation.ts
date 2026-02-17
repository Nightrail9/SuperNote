import * as fs from 'fs';

import { DefaultAIOrganizer } from './ai-organizer.js';
import {
  createId,
  getAppData,
  mutateAppData,
  timestamp,
  type ModelConfigRecord,
  type PromptConfigRecord,
  type TaskRecord,
} from './app-data-store.js';
import { getDiagnosticLogFilePath, logDiagnostic, logDiagnosticError } from './diagnostic-logger.js';
import { readWebPageWithJina } from './jina-reader-client.js';
import { buildPromptWithOptions, type NoteFormat } from './note-options.js';
import { replaceScreenshotMarkers } from './screenshot-postprocess.js';
import { getIntegrations, getModels, getPrompts } from './settings-store/index.js';
import { createSummaryPipeline, loadSummaryPipelineConfig } from './summary-pipeline.js';
import { BILIBILI_URL_PATTERN } from '../constants/index.js';

type GenerationOptions = {
  sourceUrl: string;
  promptId?: string;
  modelId?: string;
  sourceType?: 'bilibili' | 'web';
  formats?: NoteFormat[];
};

type RunningTaskContext = {
  controller: AbortController;
  stage: string;
};

const runningTasks = new Map<string, RunningTaskContext>();
const DEFAULT_LINK_CONCURRENCY = 2;
const MAX_LINK_CONCURRENCY = 4;

class TaskFailureError extends Error {
  patch: Partial<TaskRecord>;

  constructor(patch: Partial<TaskRecord>) {
    super('TASK_FAILURE');
    this.patch = patch;
  }
}

function splitAndDedupeUrls(sourceUrl: string): string[] {
  return Array.from(
    new Set(
      sourceUrl
        .split(/[\s,，]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function pickValidSourceUrls(sourceUrl: string): string[] {
  return splitAndDedupeUrls(sourceUrl).filter((item) => BILIBILI_URL_PATTERN.test(item));
}

function pickValidWebUrls(sourceUrl: string): string[] {
  return splitAndDedupeUrls(sourceUrl).filter((item) => {
    try {
      const url = new URL(item);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  });
}

function inferSourceType(options: GenerationOptions): 'bilibili' | 'web' {
  const bilibiliUrls = pickValidSourceUrls(options.sourceUrl);
  if (bilibiliUrls.length > 0) {
    return 'bilibili';
  }
  return options.sourceType === 'web' ? 'web' : 'bilibili';
}

function buildCombinedMarkdown(markdowns: Array<{ url: string; content: string }>): string {
  const blocks = markdowns.map((item, index) => {
    return [`## 来源 ${index + 1}`, '', `原始链接：${item.url}`, '', item.content.trim(), ''].join('\n');
  });
  return ['# 多链接转录内容汇总', '', ...blocks].join('\n').trim();
}

function buildCombinedWebMarkdown(contents: Array<{ url: string; title?: string; content: string }>): string {
  const blocks = contents.map((item, index) => {
    const titleLine = item.title ? `网页标题：${item.title}` : '网页标题：未提取';
    return [`## 网页来源 ${index + 1}`, '', `原始链接：${item.url}`, titleLine, '', item.content.trim(), ''].join('\n');
  });
  return ['# 网页抓取内容汇总', '', ...blocks].join('\n').trim();
}

function resolveModel(modelId?: string): ModelConfigRecord | undefined {
  const models = getModels();
  if (modelId) {
    const selected = models.find((item) => item.id === modelId);
    if (selected) {
      return selected;
    }
  }
  return models.find((item) => item.isDefault) ?? models.find((item) => item.enabled);
}

function resolvePrompt(promptId?: string): PromptConfigRecord | undefined {
  const prompts = getPrompts();
  if (promptId) {
    const selected = prompts.find((item) => item.id === promptId);
    if (selected) {
      return selected;
    }
  }
  return prompts.find((item) => item.isDefault) ?? prompts[0];
}

function getTask(taskId: string): TaskRecord | undefined {
  return getAppData().tasks.find((item) => item.id === taskId);
}

function updateTask(taskId: string, patch: Partial<TaskRecord>): void {
  mutateAppData((data) => {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task || task.status === 'cancelled') {
      return;
    }
    Object.assign(task, patch, { updatedAt: timestamp() });
  });
}

function updateTaskProgress(taskId: string, patch: { stage: string; progress: number; message: string }): void {
  const progress = Math.max(0, Math.min(100, Math.floor(patch.progress)));
  updateTask(taskId, {
    status: 'generating',
    stage: patch.stage,
    progress,
    message: patch.message,
    retryable: false,
    cancelReason: undefined,
  });
}

function withDiagnosticHint(errorMessage: string): string {
  const logFile = getDiagnosticLogFilePath();
  return `${errorMessage}（诊断日志：${logFile}）`;
}

function isCancelledError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    error.name === 'AbortError' ||
    message.includes('task_cancelled') ||
    message.includes('task cancelled') ||
    message.includes('任务已取消') ||
    message.includes('the operation was aborted')
  );
}

function throwIfCancelled(taskId: string, signal: AbortSignal): void {
  const task = getTask(taskId);
  if (signal.aborted || task?.status === 'cancelled') {
    throw new Error('TASK_CANCELLED');
  }
}

function setRunningStage(taskId: string, stage: string): void {
  const running = runningTasks.get(taskId);
  if (running) {
    running.stage = stage;
  }
}

function registerRunningTask(taskId: string): AbortController {
  const controller = new AbortController();
  runningTasks.set(taskId, { controller, stage: 'pending' });
  return controller;
}

function unregisterRunningTask(taskId: string): void {
  runningTasks.delete(taskId);
}

type SourceMedia = {
  url: string;
  videoPath: string;
};

function cleanupRetainedFiles(paths: string[]): void {
  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      continue;
    }
  }
}

function resolveLinkConcurrency(totalUrls: number): number {
  const raw = Number.parseInt(process.env.NOTE_LINK_CONCURRENCY || '', 10);
  const configured = Number.isFinite(raw) ? raw : DEFAULT_LINK_CONCURRENCY;
  const normalized = Math.max(1, Math.min(MAX_LINK_CONCURRENCY, Math.floor(configured)));
  return Math.max(1, Math.min(totalUrls, normalized));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let firstError: unknown;

  const worker = async (): Promise<void> => {
    while (true) {
      if (firstError) {
        return;
      }
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      const current = items[currentIndex];
      if (current === undefined) {
        continue;
      }
      try {
        results[currentIndex] = await mapper(current, currentIndex);
      } catch (error) {
        firstError = error;
        return;
      }
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (firstError) {
    throw firstError;
  }

  return results;
}

function mapPipelineStage(stage: string | undefined): string {
  if (!stage) {
    return 'transcribe';
  }
  return stage === 'generate' ? 'merge' : stage;
}

function resolvePipelineProgress(totalUrls: number, completedCount: number, stageProgress: number): number {
  const safeTotal = Math.max(1, totalUrls);
  const normalizedStageProgress = Math.max(0, Math.min(1, stageProgress));
  const normalizedTotalProgress = (completedCount + normalizedStageProgress) / safeTotal;
  return 15 + Math.floor(normalizedTotalProgress * 55);
}

async function runAiStage(
  taskId: string,
  mergedMarkdown: string,
  model: ModelConfigRecord,
  effectivePrompt: string,
  signal: AbortSignal,
  keyframeWarnings: string[],
  keyframeStats: Array<NonNullable<NonNullable<TaskRecord['debug']>['keyframeStats']>[number]>,
): Promise<{ success: boolean; resultMd?: string }> {
  const resolvedTimeoutMs = resolveAiTimeoutMs(model.timeoutMs, mergedMarkdown.length, effectivePrompt.length);
  throwIfCancelled(taskId, signal);
  setRunningStage(taskId, 'generate');
  updateTaskProgress(taskId, {
    stage: 'generate',
    progress: 86,
    message: '正在调用模型生成笔记',
  });

  updateTask(taskId, {
    preparedMd: mergedMarkdown,
    retryable: false,
  });

  const aiStart = Date.now();
  logDiagnostic('info', 'note-generation', 'ai_generate_started', {
    taskId,
    modelId: model.id,
    provider: model.provider,
    modelName: model.modelName,
    timeoutMs: resolvedTimeoutMs,
    mergedMarkdownLength: mergedMarkdown.length,
    promptLength: effectivePrompt.length,
  });

  const aiOrganizer = new DefaultAIOrganizer();
  const aiResult = await aiOrganizer.organize(mergedMarkdown, {
    apiUrl: model.baseUrl || '',
    apiKey: model.apiKey || '',
    provider: model.provider,
    modelName: model.modelName,
    prompt: effectivePrompt,
    timeoutMs: resolvedTimeoutMs,
    abortSignal: signal,
  });

  throwIfCancelled(taskId, signal);

  if (!aiResult.success) {
    logDiagnostic('warn', 'note-generation', 'ai_generate_failed', {
      taskId,
      modelId: model.id,
      provider: model.provider,
      modelName: model.modelName,
      elapsedMs: Date.now() - aiStart,
      errorCode: aiResult.error?.code,
      errorMessage: aiResult.error?.message,
    });
    updateTask(taskId, {
      status: 'failed',
      stage: 'generate',
      progress: 92,
      message: '模型生成失败',
      error: withDiagnosticHint(aiResult.error?.message ?? '调用大语言模型生成总结失败'),
      retryable: true,
      debug: {
        keyframeStats,
        keyframeWarnings,
      },
    });
    return { success: false };
  }

  const resultMd = (aiResult.content ?? '').trim() || mergedMarkdown;
  return { success: true, resultMd };
}

function resolveAiTimeoutMs(
  modelTimeoutMs: number | undefined,
  markdownLength: number,
  promptLength: number,
): number {
  const baseTimeoutMs =
    typeof modelTimeoutMs === 'number' && Number.isFinite(modelTimeoutMs)
      ? Math.max(15000, Math.min(600000, Math.floor(modelTimeoutMs)))
      : 60000;

  const totalInputLength = Math.max(0, markdownLength) + Math.max(0, promptLength);

  if (totalInputLength >= 30000) {
    return Math.max(baseTimeoutMs, 240000);
  }
  if (totalInputLength >= 12000) {
    return Math.max(baseTimeoutMs, 180000);
  }
  if (totalInputLength >= 6000) {
    return Math.max(baseTimeoutMs, 120000);
  }
  return baseTimeoutMs;
}

async function runTask(taskId: string, options: GenerationOptions): Promise<void> {
  const controller = registerRunningTask(taskId);
  const signal = controller.signal;
  const retainedVideoFiles: string[] = [];
  try {
    const sourceType = inferSourceType(options);
    const selectedFormats = options.formats ?? [];
    const useScreenshot = selectedFormats.includes('screenshot');
    logDiagnostic('info', 'note-generation', 'task_started', {
      taskId,
      sourceType,
      sourceUrl: options.sourceUrl,
      modelId: options.modelId,
      promptId: options.promptId,
      formats: selectedFormats,
    });
    setRunningStage(taskId, 'validate');
    updateTaskProgress(taskId, {
      stage: 'validate',
      progress: 8,
      message: '正在校验链接与任务配置',
    });

    const validUrls = sourceType === 'web' ? pickValidWebUrls(options.sourceUrl) : pickValidSourceUrls(options.sourceUrl);
    logDiagnostic('info', 'note-generation', 'validated_urls', {
      taskId,
      sourceType,
      totalUrls: validUrls.length,
      urls: validUrls,
    });
    if (validUrls.length === 0) {
      updateTask(taskId, {
        status: 'failed',
        stage: 'validate',
        progress: 8,
        message: '链接校验失败',
        error: sourceType === 'web' ? '未检测到有效的网页链接（需为 http/https）' : '未检测到有效的 Bilibili 链接',
        retryable: false,
      });
      return;
    }

    const model = resolveModel(options.modelId);
    if (!model || !model.enabled) {
      updateTask(taskId, {
        status: 'failed',
        stage: 'validate',
        progress: 10,
        message: '模型配置不可用',
        error: '未找到可用模型，请先在模型配置中启用模型',
        retryable: false,
      });
      return;
    }
    if (!model.baseUrl || !model.apiKey) {
      updateTask(taskId, {
        status: 'failed',
        stage: 'validate',
        progress: 10,
        message: '模型配置缺失',
        error: '当前模型缺少 Base URL 或 API Key，请先完善模型配置',
        retryable: false,
      });
      return;
    }

    const prompt = resolvePrompt(options.promptId);
    if (!prompt || !prompt.template.trim()) {
      updateTask(taskId, {
        status: 'failed',
        stage: 'validate',
        progress: 12,
        message: '提示词配置不可用',
        error: '未找到可用提示词模板，请先完善提示词配置',
        retryable: false,
      });
      return;
    }

    const effectivePrompt = buildPromptWithOptions(prompt.template, selectedFormats);

    let mergedMarkdown = '';
    let resolvedTitle: string | undefined;
    const keyframeWarnings: string[] = [];
    const keyframeStats: Array<NonNullable<NonNullable<TaskRecord['debug']>['keyframeStats']>[number]> = [];
    const sourceMedias: SourceMedia[] = [];
    let preferVideoCuda = false;
    const totalUrls = validUrls.length;
    const linkConcurrency = resolveLinkConcurrency(totalUrls);

    logDiagnostic('info', 'note-generation', 'link_concurrency_resolved', {
      taskId,
      sourceType,
      totalUrls,
      linkConcurrency,
    });

    if (sourceType === 'web') {
      const webContents = new Array<{ url: string; title?: string; content: string }>(totalUrls);
      const integrations = getIntegrations();

      let completedCount = 0;
      await mapWithConcurrency(validUrls, linkConcurrency, async (currentUrl, index) => {
        throwIfCancelled(taskId, signal);
        setRunningStage(taskId, 'crawl');

        const runningProgress = 15 + Math.floor((completedCount / totalUrls) * 55);
        updateTaskProgress(taskId, {
          stage: 'crawl',
          progress: runningProgress,
          message: `正在抓取网页内容（${index + 1}/${totalUrls}，并发 ${linkConcurrency}）`,
        });

        try {
          const readerResult = await readWebPageWithJina(currentUrl, {
            endpoint: integrations.jinaReader.endpoint,
            apiKey: integrations.jinaReader.apiKey,
            timeoutSec: integrations.jinaReader.timeoutSec,
            noCache: integrations.jinaReader.noCache,
            signal,
          });

          const content = readerResult.content.trim();
          if (!content) {
            throw new TaskFailureError({
              status: 'failed',
              stage: 'crawl',
              progress: runningProgress,
              message: `第 ${index + 1} 条链接抓取内容为空`,
              error: `第 ${index + 1} 条链接抓取失败：网页内容为空`,
              retryable: false,
            });
          }

          webContents[index] = {
            url: currentUrl,
            title: readerResult.title,
            content,
          };
        } catch (error) {
          if (isCancelledError(error) || error instanceof TaskFailureError) {
            throw error;
          }
          throw new TaskFailureError({
            status: 'failed',
            stage: 'crawl',
            progress: runningProgress,
            message: `第 ${index + 1} 条链接抓取失败`,
            error: withDiagnosticHint(`第 ${index + 1} 条链接抓取失败：${error instanceof Error ? error.message : '未知错误'}`),
            retryable: false,
          });
        }

        completedCount += 1;
        const mergedProgress = 15 + Math.floor((completedCount / totalUrls) * 55);
        updateTaskProgress(taskId, {
          stage: 'merge',
          progress: mergedProgress,
          message: `正在整理网页抓取结果（${completedCount}/${totalUrls}）`,
        });
      }).catch((error) => {
        if (error instanceof TaskFailureError) {
          updateTask(taskId, error.patch);
          return;
        }
        throw error;
      });

      const currentTask = getTask(taskId);
      if (currentTask?.status === 'failed') {
        return;
      }

      const normalizedWebContents = webContents.filter(Boolean);
      if (totalUrls > 1) {
        resolvedTitle = '多链接网页笔记';
      } else {
        const singleWebTitle = normalizedWebContents[0]?.title?.trim();
        if (singleWebTitle) {
          resolvedTitle = singleWebTitle;
        }
      }

      mergedMarkdown = buildCombinedWebMarkdown(normalizedWebContents);
    } else {
      const pipelineConfig = loadSummaryPipelineConfig();
      preferVideoCuda = pipelineConfig.localTranscriber.device === 'cuda';
      const pipeline = createSummaryPipeline(pipelineConfig);
      const sourceMarkdownList = new Array<{ url: string; content: string }>(totalUrls);

      let completedCount = 0;
      await mapWithConcurrency(validUrls, linkConcurrency, async (currentUrl, index) => {
        throwIfCancelled(taskId, signal);

        const transcribeProgress = resolvePipelineProgress(totalUrls, completedCount, 0);
        updateTaskProgress(taskId, {
          stage: 'parse',
          progress: transcribeProgress,
          message: `正在准备处理视频（${index + 1}/${totalUrls}，并发 ${linkConcurrency}）`,
        });

        const extractResult = await pipeline.execute(currentUrl, undefined, {
          signal,
          retainTempFile: useScreenshot,
          enableKeyframes: useScreenshot,
          preferVideoCuda,
          onProgress: ({ stage, progress, message }) => {
            if (signal.aborted) {
              return;
            }
            const stageName = mapPipelineStage(stage);
            setRunningStage(taskId, stageName);
            const runningProgress = resolvePipelineProgress(totalUrls, completedCount, progress);
            updateTaskProgress(taskId, {
              stage: stageName,
              progress: runningProgress,
              message: `${message}（${index + 1}/${totalUrls}）`,
            });
          },
        });

        throwIfCancelled(taskId, signal);

        if (!extractResult.success) {
          logDiagnostic('warn', 'note-generation', 'pipeline_failed', {
            taskId,
            url: currentUrl,
            stage: extractResult.error?.stage,
            code: extractResult.error?.code,
            message: extractResult.error?.message,
          });
          throw new TaskFailureError({
            status: 'failed',
            stage: mapPipelineStage(extractResult.error?.stage),
            progress: transcribeProgress,
            message: `第 ${index + 1} 条链接处理失败`,
            error: withDiagnosticHint(`第 ${index + 1} 条链接处理失败：${extractResult.error?.message ?? '转录与提取失败'}`),
            retryable: false,
          });
        }

        const markdown = (extractResult.markdown ?? '').trim();
        if (!markdown) {
          throw new TaskFailureError({
            status: 'failed',
            stage: 'transcribe',
            progress: transcribeProgress,
            message: `第 ${index + 1} 条链接未生成可用内容`,
            error: withDiagnosticHint(`第 ${index + 1} 条链接未生成可用的转录 Markdown`),
            retryable: false,
          });
        }

        if (totalUrls === 1) {
          const title = extractResult.title?.trim();
          if (title) {
            resolvedTitle = title;
          }
        } else if (totalUrls > 1) {
          resolvedTitle = '多链接视频笔记';
        }

        if (extractResult.keyframeStats) {
          keyframeStats.push({
            url: currentUrl,
            ...extractResult.keyframeStats,
          });
        }
        if (extractResult.warnings && extractResult.warnings.length > 0) {
          keyframeWarnings.push(...extractResult.warnings.map((item) => `[${index + 1}/${totalUrls}] ${item}`));
        }
        if (useScreenshot && extractResult.videoFilePath) {
          sourceMedias.push({ url: currentUrl, videoPath: extractResult.videoFilePath });
          retainedVideoFiles.push(extractResult.videoFilePath);
        }

        sourceMarkdownList[index] = { url: currentUrl, content: markdown };

        completedCount += 1;
        const mergedProgress = 15 + Math.floor((completedCount / totalUrls) * 55);
        updateTaskProgress(taskId, {
          stage: 'merge',
          progress: mergedProgress,
          message: `正在整理转录结果（${completedCount}/${totalUrls}）`,
        });
      }).catch((error) => {
        if (error instanceof TaskFailureError) {
          updateTask(taskId, error.patch);
          return;
        }
        throw error;
      });

      const currentTask = getTask(taskId);
      if (currentTask?.status === 'failed') {
        return;
      }

      mergedMarkdown = buildCombinedMarkdown(sourceMarkdownList.filter(Boolean));
    }

    const aiStageResult = await runAiStage(
      taskId,
      mergedMarkdown,
      model,
      effectivePrompt,
      signal,
      keyframeWarnings,
      keyframeStats,
    );
    if (!aiStageResult.success || !aiStageResult.resultMd) {
      return;
    }

    let resultMd = aiStageResult.resultMd;
    if (sourceType === 'bilibili' && useScreenshot) {
      if (sourceMedias.length === 1 && sourceMedias[0]) {
        const screenshotResult = await replaceScreenshotMarkers({
          markdown: resultMd,
          videoPath: sourceMedias[0].videoPath,
          taskId,
          preferCuda: preferVideoCuda,
        });
        resultMd = screenshotResult.markdown;
        if (screenshotResult.warnings.length > 0) {
          keyframeWarnings.push(...screenshotResult.warnings);
        }
      } else if (sourceMedias.length > 1) {
        keyframeWarnings.push('多链接任务暂不支持精准截图替换，已保留截图时间戳标记。');
      } else {
        keyframeWarnings.push('未获取到可用视频文件，无法执行原片截图替换。');
      }
    }

    logDiagnostic('info', 'note-generation', 'task_completed', {
      taskId,
      resultLength: resultMd.length,
      keyframeWarningCount: keyframeWarnings.length,
      keyframeStatsCount: keyframeStats.length,
      screenshotMode: sourceType === 'bilibili' && useScreenshot ? 'enabled' : 'disabled',
    });

    updateTask(taskId, {
      status: 'success',
      stage: 'done',
      progress: 100,
      message: '生成完成',
      resultMd,
      resolvedTitle,
      retryable: false,
      preparedMd: mergedMarkdown,
      cancelReason: undefined,
      debug: {
        keyframeStats,
        keyframeWarnings,
      },
      error: undefined,
    });
  } catch (error) {
    if (isCancelledError(error)) {
      const task = getTask(taskId);
      if (task && task.status !== 'cancelled') {
        mutateAppData((data) => {
          const current = data.tasks.find((item) => item.id === taskId);
          if (!current || current.status === 'cancelled') {
            return;
          }
          current.status = 'cancelled';
          current.stage = current.stage ?? 'cancelled';
          current.progress = Math.min(100, Math.max(0, Number(current.progress || 0)));
          current.message = '任务已取消';
          current.error = undefined;
          current.retryable = false;
          current.resultMd = undefined;
          current.preparedMd = undefined;
          current.debug = undefined;
          current.updatedAt = timestamp();
        });
      }
      return;
    }

    const message = error instanceof Error ? error.message : '生成任务执行失败';
    logDiagnosticError('note-generation', 'task_crashed', error, {
      taskId,
      sourceUrl: options.sourceUrl,
      sourceType: options.sourceType,
    });
    updateTask(taskId, {
      status: 'failed',
      stage: 'server',
      progress: 100,
      message: '任务执行失败',
      error: withDiagnosticHint(message),
      retryable: false,
    });
  } finally {
    cleanupRetainedFiles(retainedVideoFiles);
    unregisterRunningTask(taskId);
  }
}

export function startGenerateTask(options: GenerationOptions): TaskRecord {
  const now = timestamp();
  const task: TaskRecord = {
    id: createId('task'),
    status: 'generating',
    stage: 'pending',
    progress: 0,
    message: '任务已创建，等待开始',
    sourceUrl: options.sourceUrl,
    sourceType: options.sourceType === 'web' ? 'web' : 'bilibili',
    promptId: options.promptId,
    modelId: options.modelId,
    formats: options.formats,
    retryable: false,
    createdAt: now,
    updatedAt: now,
  };

  mutateAppData((data) => {
    data.tasks.unshift(task);
  });

  void runTask(task.id, options);
  return task;
}

export function cancelGenerateTask(taskId: string): { ok: boolean; message: string; task?: TaskRecord } {
  const task = getTask(taskId);
  if (!task) {
    return { ok: false, message: '任务不存在' };
  }
  if (task.status === 'success') {
    return { ok: false, message: '任务已完成，无法取消', task };
  }
  if (task.status === 'cancelled') {
    return { ok: true, message: '任务已取消', task };
  }

  const runtime = runningTasks.get(taskId);
  runtime?.controller.abort();

  mutateAppData((data) => {
    const current = data.tasks.find((item) => item.id === taskId);
    if (!current) {
      return;
    }
    current.status = 'cancelled';
    current.message = '任务已取消';
    current.cancelReason = 'user_cancelled';
    current.retryable = false;
    current.resultMd = undefined;
    current.preparedMd = undefined;
    current.debug = undefined;
    current.error = undefined;
    current.updatedAt = timestamp();
  });

  logDiagnostic('info', 'note-generation', 'task_cancelled', {
    taskId,
    stage: runtime?.stage ?? task.stage,
  });

  return { ok: true, message: '任务已取消', task: getTask(taskId) };
}

export function retryGenerateTask(taskId: string): { ok: boolean; message: string; task?: TaskRecord } {
  const task = getTask(taskId);
  if (!task) {
    return { ok: false, message: '任务不存在' };
  }
  if (runningTasks.has(taskId) || task.status === 'generating') {
    return { ok: false, message: '任务仍在执行中，无法重试', task };
  }
  if (task.status !== 'failed' || task.stage !== 'generate' || !task.retryable || !task.preparedMd?.trim()) {
    return { ok: false, message: '当前任务不支持重试', task };
  }

  const model = resolveModel(task.modelId);
  if (!model || !model.enabled || !model.baseUrl || !model.apiKey) {
    return { ok: false, message: '当前模型不可用，请检查模型配置', task };
  }
  const prompt = resolvePrompt(task.promptId);
  if (!prompt || !prompt.template.trim()) {
    return { ok: false, message: '提示词模板不可用，请检查提示词配置', task };
  }
  const effectivePrompt = buildPromptWithOptions(
    prompt.template,
    (task.formats as NoteFormat[] | undefined) ?? [],
  );

  const preparedMd = task.preparedMd;
  const keyframeWarnings = task.debug?.keyframeWarnings ?? [];
  const keyframeStats = task.debug?.keyframeStats ?? [];

  mutateAppData((data) => {
    const current = data.tasks.find((item) => item.id === taskId);
    if (!current) {
      return;
    }
    current.status = 'generating';
    current.stage = 'generate';
    current.progress = 86;
    current.message = '正在重试模型生成';
    current.error = undefined;
    current.retryable = false;
    current.cancelReason = undefined;
    current.updatedAt = timestamp();
  });

  void (async () => {
    const controller = registerRunningTask(taskId);
    try {
      const aiResult = await runAiStage(
        taskId,
        preparedMd,
        model,
        effectivePrompt,
        controller.signal,
        keyframeWarnings,
        keyframeStats,
      );
      if (!aiResult.success || !aiResult.resultMd) {
        return;
      }
      updateTask(taskId, {
        status: 'success',
        stage: 'done',
        progress: 100,
        message: '生成完成',
        resultMd: aiResult.resultMd,
        retryable: false,
        preparedMd,
        cancelReason: undefined,
        debug: {
          keyframeStats,
          keyframeWarnings,
        },
        error: undefined,
      });
    } catch (error) {
      if (!isCancelledError(error)) {
        logDiagnosticError('note-generation', 'retry_failed_unexpected', error, { taskId });
        updateTask(taskId, {
          status: 'failed',
          stage: 'generate',
          progress: 92,
          message: '重试失败',
          error: withDiagnosticHint(error instanceof Error ? error.message : '重试失败'),
          retryable: true,
        });
      }
    } finally {
      unregisterRunningTask(taskId);
    }
  })();

  return { ok: true, message: '已开始重试生成', task: getTask(taskId) };
}

export function refineGenerateTask(taskId: string): { ok: boolean; message: string; task?: TaskRecord } {
  const task = getTask(taskId);
  if (!task) {
    return { ok: false, message: '任务不存在' };
  }
  if (runningTasks.has(taskId) || task.status === 'generating') {
    return { ok: false, message: '任务仍在执行中，无法再次整理', task };
  }
  if (task.status !== 'success') {
    return { ok: false, message: '仅已完成任务支持再次整理', task };
  }

  const sourceMarkdown = task.preparedMd?.trim() || task.resultMd?.trim();
  if (!sourceMarkdown) {
    return { ok: false, message: '缺少可整理内容，请重新生成任务', task };
  }

  const model = resolveModel(task.modelId);
  if (!model || !model.enabled || !model.baseUrl || !model.apiKey) {
    return { ok: false, message: '当前模型不可用，请检查模型配置', task };
  }
  const prompt = resolvePrompt(task.promptId);
  if (!prompt || !prompt.template.trim()) {
    return { ok: false, message: '提示词模板不可用，请检查提示词配置', task };
  }

  const effectivePrompt = buildPromptWithOptions(
    prompt.template,
    (task.formats as NoteFormat[] | undefined) ?? [],
  );
  const keyframeWarnings = task.debug?.keyframeWarnings ?? [];
  const keyframeStats = task.debug?.keyframeStats ?? [];

  mutateAppData((data) => {
    const current = data.tasks.find((item) => item.id === taskId);
    if (!current) {
      return;
    }
    current.status = 'generating';
    current.stage = 'generate';
    current.progress = 86;
    current.message = '正在重新整理内容';
    current.error = undefined;
    current.retryable = false;
    current.cancelReason = undefined;
    current.updatedAt = timestamp();
  });

  void (async () => {
    const controller = registerRunningTask(taskId);
    try {
      const aiResult = await runAiStage(
        taskId,
        sourceMarkdown,
        model,
        effectivePrompt,
        controller.signal,
        keyframeWarnings,
        keyframeStats,
      );
      if (!aiResult.success || !aiResult.resultMd) {
        return;
      }
      updateTask(taskId, {
        status: 'success',
        stage: 'done',
        progress: 100,
        message: '再次整理完成',
        resultMd: aiResult.resultMd,
        retryable: false,
        preparedMd: sourceMarkdown,
        cancelReason: undefined,
        debug: {
          keyframeStats,
          keyframeWarnings,
        },
        error: undefined,
      });
    } catch (error) {
      if (!isCancelledError(error)) {
        logDiagnosticError('note-generation', 'refine_failed_unexpected', error, { taskId });
        updateTask(taskId, {
          status: 'failed',
          stage: 'generate',
          progress: 92,
          message: '再次整理失败',
          error: withDiagnosticHint(error instanceof Error ? error.message : '再次整理失败'),
          retryable: true,
        });
      }
    } finally {
      unregisterRunningTask(taskId);
    }
  })();

  return { ok: true, message: '已开始再次整理', task: getTask(taskId) };
}

export function deleteGenerateTask(taskId: string): { ok: boolean; message: string } {
  const task = getTask(taskId);
  if (!task) {
    return { ok: false, message: '任务不存在' };
  }
  if (runningTasks.has(taskId) || task.status === 'generating') {
    return { ok: false, message: '任务仍在执行中，无法删除' };
  }

  mutateAppData((data) => {
    data.tasks = data.tasks.filter((item) => item.id !== taskId);
  });

  logDiagnostic('info', 'note-generation', 'task_deleted', {
    taskId,
    status: task.status,
    stage: task.stage,
  });

  return { ok: true, message: '任务已删除' };
}
