import { createSummaryPipeline, loadSummaryPipelineConfig } from './summary-pipeline.js';
import { DefaultAIOrganizer } from './ai-organizer.js';
import { readWebPageWithJina } from './jina-reader-client.js';
import {
  createId,
  getAppData,
  mutateAppData,
  timestamp,
  type ModelConfigRecord,
  type PromptConfigRecord,
  type TaskRecord,
} from './app-data-store.js';

type GenerationOptions = {
  sourceUrl: string;
  promptId?: string;
  modelId?: string;
  sourceType?: 'bilibili' | 'web';
};

const BILIBILI_URL_PATTERN =
  /^https?:\/\/(?:(?:www\.|m\.)?bilibili\.com\/video\/(?:BV[a-zA-Z0-9]+|av\d+)|b23\.tv\/[a-zA-Z0-9]+)/i;

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

function simplifyTitle(raw: string): string {
  const normalized = raw
    .replace(/\s+/g, ' ')
    .replace(/[【】\[\]]/g, '')
    .trim();
  if (!normalized) {
    return '';
  }

  const primary = normalized
    .split(/[|｜_]/)
    .map((item) => item.trim())
    .filter(Boolean)[0] ?? normalized;

  const short =
    primary
      .split(/\s[-–—]\s/)
      .map((item) => item.trim())
      .filter(Boolean)[0] ?? primary;

  if (short.length <= 28) {
    return short;
  }
  return `${short.slice(0, 27).trim()}…`;
}

function buildSuggestedWebTitle(contents: Array<{ title?: string }>): string | undefined {
  const titles = contents
    .map((item) => simplifyTitle(item.title ?? ''))
    .filter((item) => item.length > 0);

  if (!titles.length) {
    return undefined;
  }

  const firstTitle = titles[0] ?? '';
  if (titles.length === 1) {
    return firstTitle;
  }

  const suffix = `等${titles.length}篇`;
  const maxPrefixLength = Math.max(8, 28 - suffix.length);
  const prefix = firstTitle.length > maxPrefixLength ? `${firstTitle.slice(0, maxPrefixLength - 1).trim()}…` : firstTitle;
  return `${prefix}${suffix}`;
}

function resolveModel(modelId?: string): ModelConfigRecord | undefined {
  const models = getAppData().settings.models;
  if (modelId) {
    const selected = models.find((item) => item.id === modelId);
    if (selected) {
      return selected;
    }
  }
  return models.find((item) => item.isDefault) ?? models.find((item) => item.enabled);
}

function resolvePrompt(promptId?: string): PromptConfigRecord | undefined {
  const prompts = getAppData().settings.prompts;
  if (promptId) {
    const selected = prompts.find((item) => item.id === promptId);
    if (selected) {
      return selected;
    }
  }
  return prompts.find((item) => item.isDefault) ?? prompts[0];
}

function updateTask(taskId: string, patch: Partial<TaskRecord>): void {
  mutateAppData((data) => {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) {
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
  });
}

async function runTask(taskId: string, options: GenerationOptions): Promise<void> {
  try {
    const sourceType = options.sourceType === 'web' ? 'web' : 'bilibili';
    updateTaskProgress(taskId, {
      stage: 'validate',
      progress: 8,
      message: '正在校验链接与任务配置',
    });

    const validUrls = sourceType === 'web' ? pickValidWebUrls(options.sourceUrl) : pickValidSourceUrls(options.sourceUrl);
    if (validUrls.length === 0) {
      updateTask(taskId, {
        status: 'failed',
        stage: 'validate',
        progress: 8,
        message: '链接校验失败',
        error: sourceType === 'web' ? '未检测到有效的网页链接（需为 http/https）' : '未检测到有效的 Bilibili 链接',
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
      });
      return;
    }

    let mergedMarkdown = '';
    let suggestedTitle: string | undefined;
    const totalUrls = validUrls.length;

    if (sourceType === 'web') {
      const webContents: Array<{ url: string; title?: string; content: string }> = [];
      const integrations = getAppData().settings.integrations;

      for (let index = 0; index < validUrls.length; index++) {
        const currentUrl = validUrls[index];
        if (!currentUrl) {
          continue;
        }

        const crawlProgress = 15 + Math.floor((index / totalUrls) * 55);
        updateTaskProgress(taskId, {
          stage: 'crawl',
          progress: crawlProgress,
          message: `正在抓取网页内容（${index + 1}/${totalUrls}）`,
        });

        try {
          const readerResult = await readWebPageWithJina(currentUrl, {
            endpoint: integrations.jinaReader.endpoint,
            apiKey: integrations.jinaReader.apiKey,
            timeoutSec: integrations.jinaReader.timeoutSec,
            noCache: integrations.jinaReader.noCache,
          });

          const content = readerResult.content.trim();
          if (!content) {
            updateTask(taskId, {
              status: 'failed',
              stage: 'crawl',
              progress: crawlProgress,
              message: `第 ${index + 1} 条链接抓取内容为空`,
              error: `第 ${index + 1} 条链接抓取失败：网页内容为空`,
            });
            return;
          }

          webContents.push({
            url: currentUrl,
            title: readerResult.title,
            content,
          });
        } catch (error) {
          updateTask(taskId, {
            status: 'failed',
            stage: 'crawl',
            progress: crawlProgress,
            message: `第 ${index + 1} 条链接抓取失败`,
            error: `第 ${index + 1} 条链接抓取失败：${error instanceof Error ? error.message : '未知错误'}`,
          });
          return;
        }

        const mergedProgress = 15 + Math.floor(((index + 1) / totalUrls) * 55);
        updateTaskProgress(taskId, {
          stage: 'merge',
          progress: mergedProgress,
          message: `正在整理网页抓取结果（${index + 1}/${totalUrls}）`,
        });
      }

      mergedMarkdown = buildCombinedWebMarkdown(webContents);
      suggestedTitle = buildSuggestedWebTitle(webContents);
    } else {
      const pipeline = createSummaryPipeline(loadSummaryPipelineConfig());
      const sourceMarkdownList: Array<{ url: string; content: string }> = [];

      for (let index = 0; index < validUrls.length; index++) {
        const currentUrl = validUrls[index];
        if (!currentUrl) {
          continue;
        }

        const transcribeProgress = 15 + Math.floor((index / totalUrls) * 55);
        updateTaskProgress(taskId, {
          stage: 'transcribe',
          progress: transcribeProgress,
          message: `正在进行视频转录（${index + 1}/${totalUrls}）`,
        });

        const extractResult = await pipeline.execute(currentUrl);
        if (!extractResult.success) {
          updateTask(taskId, {
            status: 'failed',
            stage: extractResult.error?.stage ?? 'transcribe',
            progress: transcribeProgress,
            message: `第 ${index + 1} 条链接处理失败`,
            error: `第 ${index + 1} 条链接处理失败：${extractResult.error?.message ?? '转录与提取失败'}`,
          });
          return;
        }
        const markdown = (extractResult.markdown ?? '').trim();
        if (!markdown) {
          updateTask(taskId, {
            status: 'failed',
            stage: 'transcribe',
            progress: transcribeProgress,
            message: `第 ${index + 1} 条链接未生成可用内容`,
            error: `第 ${index + 1} 条链接未生成可用的转录 Markdown`,
          });
          return;
        }
        sourceMarkdownList.push({ url: currentUrl, content: markdown });

        const mergedProgress = 15 + Math.floor(((index + 1) / totalUrls) * 55);
        updateTaskProgress(taskId, {
          stage: 'merge',
          progress: mergedProgress,
          message: `正在整理转录结果（${index + 1}/${totalUrls}）`,
        });
      }

      mergedMarkdown = buildCombinedMarkdown(sourceMarkdownList);
    }

    updateTaskProgress(taskId, {
      stage: 'generate',
      progress: 86,
      message: '正在调用模型生成笔记',
    });

    const aiOrganizer = new DefaultAIOrganizer();
    const aiResult = await aiOrganizer.organize(mergedMarkdown, {
      apiUrl: model.baseUrl,
      apiKey: model.apiKey,
      provider: model.provider,
      modelName: model.modelName,
      prompt: prompt.template,
      timeoutMs: model.timeoutMs,
    });

    if (!aiResult.success) {
      updateTask(taskId, {
        status: 'failed',
        stage: 'generate',
        progress: 92,
        message: '模型生成失败',
        error: aiResult.error?.message ?? '调用大语言模型生成总结失败',
      });
      return;
    }

    const resultMd = (aiResult.content ?? '').trim() || mergedMarkdown;
    updateTask(taskId, {
      status: 'success',
      stage: 'done',
      progress: 100,
      message: '生成完成',
      suggestedTitle,
      resultMd,
      error: undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成任务执行失败';
    updateTask(taskId, {
      status: 'failed',
      stage: 'server',
      progress: 100,
      message: '任务执行失败',
      error: message,
    });
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
    createdAt: now,
    updatedAt: now,
  };

  mutateAppData((data) => {
    data.tasks.unshift(task);
  });

  void runTask(task.id, options);
  return task;
}
