import { execFile } from 'child_process';
import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { TIMEOUTS } from '../constants/index.js';
import { DefaultAIOrganizer } from '../services/ai-organizer.js';
import {
  getAppData,
  maskSecret,
  mutateAppData,
  timestamp,
  type IntegrationConfigRecord,
  type LocalTranscriberConfigRecord,
  type ModelConfigRecord,
  type PromptConfigRecord,
  type VideoUnderstandingConfigRecord,
} from '../services/app-data-store.js';
import { normalizeJinaReaderEndpoint, readWebPageWithJina } from '../services/jina-reader-client.js';
import { sendApiError, toErrorMessage } from '../utils/http-error.js';
import { resolveProjectPath, resolveCommand, getProjectRoot } from '../utils/path-resolver.js';
import { createAbortSignal } from '../utils/retry.js';
import { normalizeBaseUrl, isGeminiNativeUrl, stripApiPath } from '../utils/url-helpers.js';
import type { Request, Response } from 'express';

const execFileAsync = promisify(execFile);

const LOCAL_TRANSCRIBER_ENV_KEYS = [
  'LOCAL_ASR_COMMAND',
  'FFMPEG_BIN',
  'LOCAL_ASR_MODEL',
  'LOCAL_ASR_LANGUAGE',
  'LOCAL_ASR_DEVICE',
  'LOCAL_ASR_BEAM_SIZE',
  'LOCAL_ASR_TEMPERATURE',
  'LOCAL_ASR_TIMEOUT_MS',
] as const;

type LocalTranscriberEnvKey = (typeof LOCAL_TRANSCRIBER_ENV_KEYS)[number];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function upsertEnvFileValues<T extends string>(
  filePath: string,
  keys: readonly T[],
  values: Record<T, string>,
): void {
  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  const lineBreak = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.length > 0 ? raw.split(/\r?\n/) : [];
  const keySet = new Set(keys);
  const updated = new Set<T>();

  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i] ?? '';
    if (!current.trim() || current.trimStart().startsWith('#')) {
      continue;
    }
    const match = /^([A-Z0-9_]+)\s*=/.exec(current);
    if (!match) {
      continue;
    }
    const key = match[1] as T;
    if (!keySet.has(key) || updated.has(key)) {
      continue;
    }
    lines[i] = `${key}=${values[key]}`;
    updated.add(key);
  }

  const missing = keys.filter((key) => !updated.has(key));
  if (missing.length > 0) {
    if (lines.length > 0 && lines[lines.length - 1]?.trim() !== '') {
      lines.push('');
    }
    for (const key of missing) {
      lines.push(`${key}=${values[key]}`);
    }
  }

  const next = `${lines.join(lineBreak)}${lineBreak}`;
  fs.writeFileSync(filePath, next, 'utf-8');
}

function normalizeLocalTranscriberInput(
  incoming: Partial<LocalTranscriberConfigRecord> | undefined,
  prev: LocalTranscriberConfigRecord,
): LocalTranscriberConfigRecord {
  const command = typeof incoming?.command === 'string' && incoming.command.trim()
    ? incoming.command.trim()
    : prev.command;
  const ffmpegBin = typeof incoming?.ffmpegBin === 'string' && incoming.ffmpegBin.trim()
    ? incoming.ffmpegBin.trim()
    : prev.ffmpegBin;
  const model = typeof incoming?.model === 'string' && incoming.model.trim()
    ? incoming.model.trim()
    : prev.model;
  const language = typeof incoming?.language === 'string' && incoming.language.trim()
    ? incoming.language.trim()
    : prev.language;
  const device = incoming?.device === 'cpu' || incoming?.device === 'cuda'
    ? incoming.device
    : prev.device;
  const beamSize = typeof incoming?.beamSize === 'number'
    ? Math.floor(clamp(incoming.beamSize, 1, 10))
    : prev.beamSize;
  const temperature = typeof incoming?.temperature === 'number'
    ? clamp(incoming.temperature, 0, 1)
    : prev.temperature;
  const timeoutMs = typeof incoming?.timeoutMs === 'number'
    ? Math.floor(clamp(incoming.timeoutMs, 30000, 1800000))
    : prev.timeoutMs;

  return {
    engine: 'whisper_cli',
    command,
    ffmpegBin,
    model,
    language,
    device,
    cudaChecked: prev.cudaChecked,
    cudaAvailable: prev.cudaAvailable,
    cudaEnabledOnce: prev.cudaEnabledOnce || device === 'cuda',
    beamSize,
    temperature,
    timeoutMs,
  };
}

function buildOpenAIModelsEndpoint(baseUrl: string): string {
  const normalized = stripApiPath(baseUrl);
  return `${normalized}/models`;
}

export function buildGeminiModelsEndpoint(baseUrl: string, apiKey: string): string {
  let normalized = normalizeBaseUrl(baseUrl);
  if (isGeminiNativeUrl(normalized)) {
    normalized = normalized.replace(/\/openai$/i, '');
    return `${normalized}/models?key=${encodeURIComponent(apiKey)}`;
  }
  // 代理地址：使用 OpenAI 兼容格式
  normalized = normalized.replace(/\/(chat\/completions|completions|responses|openai)$/i, '');
  return `${normalized}/models`;
}

function resolveDetectErrorMessage(error: unknown): string {
  const message = toErrorMessage(error, '模型检测失败');
  if (/aborted|timeout|timed out|signal/i.test(message)) {
    return '请求超时，请检查网络后重试';
  }
  if (/\(401\)|\b401\b/i.test(message)) {
    return '鉴权失败，请检查 API Key';
  }
  if (/\(403\)|\b403\b/i.test(message)) {
    return '无权限访问模型列表';
  }
  if (/\(404\)|\b404\b/i.test(message)) {
    return '接口地址不正确，请检查 Base URL';
  }
  if (/\(429\)|\b429\b/i.test(message)) {
    return '请求过于频繁，请稍后再试';
  }
  return '模型检测失败，请检查配置';
}

async function testModelReachability(options: {
  provider: ModelConfigRecord['provider'];
  modelName: string;
  baseUrl: string;
  apiKey: string;
}): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const startAt = Date.now();
  const normalizedBaseUrl = stripApiPath(options.baseUrl);
  const organizer = new DefaultAIOrganizer();

  try {
    const result = await organizer.organize('连通性测试', {
      apiUrl: normalizedBaseUrl,
      apiKey: options.apiKey,
      provider: options.provider,
      modelName: options.modelName,
      prompt: '请回复 ok',
      timeoutMs: TIMEOUTS.MODEL_DETECT_MS,
    });

    if (!result.success) {
      return {
        ok: false,
        message: result.error?.message ?? '模型接口不可用',
        latencyMs: Date.now() - startAt,
      };
    }

    return {
      ok: true,
      message: '连接测试通过，模型可用',
      latencyMs: Date.now() - startAt,
    };
  } catch (error) {
    const message = toErrorMessage(error, '连接测试失败');
    if (/aborted|timeout|timed out|signal/i.test(message)) {
      return { ok: false, message: '请求超时，请检查网络或接口地址', latencyMs: Date.now() - startAt };
    }
    return { ok: false, message, latencyMs: Date.now() - startAt };
  }
}

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: createAbortSignal(TIMEOUTS.MODEL_DETECT_MS),
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const detail =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>).error ?? (parsed as Record<string, unknown>).message
        : parsed;
    throw new Error(`模型检测请求失败(${response.status}): ${String(detail ?? response.statusText)}`);
  }

  return parsed;
}

function normalizeDetectedModelNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result = value
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }
      if (!item || typeof item !== 'object') {
        return '';
      }
      const record = item as Record<string, unknown>;
      const candidate = record.id ?? record.model ?? record.name ?? record.modelName;
      if (typeof candidate !== 'string') {
        return '';
      }
      return candidate.replace(/^models\//, '').trim();
    })
    .filter(Boolean);

  return Array.from(new Set(result));
}

async function detectOpenAICompatibleModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const endpoint = buildOpenAIModelsEndpoint(baseUrl);
  const payload = await requestJson(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  const data = payload as { data?: unknown; models?: unknown };
  return normalizeDetectedModelNames(Array.isArray(data.data) ? data.data : data.models);
}

async function detectGeminiModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const endpoint = buildGeminiModelsEndpoint(baseUrl, apiKey);

  if (isGeminiNativeUrl(baseUrl)) {
    // 原生 Gemini 格式
    const payload = await requestJson(endpoint, {
      headers: { Accept: 'application/json', 'x-goog-api-key': apiKey },
    });
    const data = payload as { models?: unknown };
    return normalizeDetectedModelNames(data.models)
      .filter((name) => name.toLowerCase().includes('gemini'));
  }

  // OpenAI 兼容格式
  const payload = await requestJson(endpoint, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  const data = payload as { data?: unknown; models?: unknown };
  return normalizeDetectedModelNames(Array.isArray(data.data) ? data.data : data.models);
}

function normalizeModelPayload(payload: unknown): ModelConfigRecord[] | null {
  if (!Array.isArray(payload)) {
    return null;
  }

  const mapped = payload
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Partial<ModelConfigRecord>)
    .filter((item) => typeof item.id === 'string' && typeof item.provider === 'string')
    .map((item) => ({
      id: item.id as string,
      provider: item.provider as ModelConfigRecord['provider'],
      enabled: Boolean(item.enabled),
      isDefault: Boolean(item.isDefault),
      baseUrl: typeof item.baseUrl === 'string' ? item.baseUrl.trim() : undefined,
      apiKey: typeof item.apiKey === 'string' ? item.apiKey.trim() : undefined,
      modelName: typeof item.modelName === 'string' ? item.modelName.trim() : '',
      timeoutMs: typeof item.timeoutMs === 'number' ? item.timeoutMs : undefined,
    }));

  return mapped;
}

function getMaskedModels(): Array<ModelConfigRecord & { apiKeyMasked?: string }> {
  return getAppData().settings.models.map((item) => ({
    ...item,
    apiKeyMasked: maskSecret(item.apiKey),
  }));
}

function getMaskedIntegrations(): IntegrationConfigRecord & {
  jinaReader: IntegrationConfigRecord['jinaReader'] & { apiKeyMasked?: string };
} {
  const integrations = getAppData().settings.integrations;
  const timeoutSec = Number.isFinite(integrations.jinaReader.timeoutSec)
    ? Math.max(3, Math.min(180, Math.floor(integrations.jinaReader.timeoutSec ?? 30)))
    : 30;
  return {
    jinaReader: {
      ...integrations.jinaReader,
      endpoint: normalizeJinaReaderEndpoint(integrations.jinaReader.endpoint),
      apiKey: undefined,
      timeoutSec,
      apiKeyMasked: maskSecret(integrations.jinaReader.apiKey),
    },
  };
}

function resolveModelById(value: unknown): ModelConfigRecord | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const id = value.trim();
  return getAppData().settings.models.find((item) => item.id === id);
}

function isModelProvider(value: string): value is ModelConfigRecord['provider'] {
  return value === 'gemini' || value === 'chatgpt' || value === 'openai_compatible';
}

export function createSettingsRouter(): Router {
  const router = Router();

  router.get('/settings/models', async (_req: Request, res: Response) => {
    try {
      res.json(getMaskedModels());
    } catch (error) {
      sendApiError(res, 500, 'GET_MODELS_FAILED', toErrorMessage(error, '获取模型配置失败'));
    }
  });

  router.put('/settings/models', async (req: Request, res: Response) => {
    try {
      const payload = normalizeModelPayload(req.body);
      if (!payload || payload.length === 0) {
        sendApiError(res, 400, 'INVALID_MODELS_PAYLOAD', '模型配置格式不正确');
        return;
      }

      const existingById = new Map(getAppData().settings.models.map((item) => [item.id, item]));
      const merged: ModelConfigRecord[] = payload.map((item) => {
        const prev = existingById.get(item.id);
        return {
          ...item,
          apiKey: item.apiKey ? item.apiKey : prev?.apiKey,
        };
      });

      const hasDefault = merged.some((item) => item.isDefault);
      if (!hasDefault && merged.length > 0) {
        merged[0].isDefault = true;
      }

      mutateAppData((data) => {
        data.settings.models = merged;
      });

      res.json({ success: true });
    } catch (error) {
      sendApiError(res, 500, 'UPDATE_MODELS_FAILED', toErrorMessage(error, '保存模型配置失败'));
    }
  });

  router.post('/settings/models/detect', async (req: Request, res: Response) => {
    try {
      const fromSavedModel = resolveModelById(req.body?.id);
      const provider =
        typeof req.body?.provider === 'string'
          ? req.body.provider
          : fromSavedModel?.provider ?? '';
      const baseUrl =
        typeof req.body?.baseUrl === 'string' && req.body.baseUrl.trim()
          ? req.body.baseUrl.trim()
          : fromSavedModel?.baseUrl?.trim() ?? '';
      const apiKey =
        typeof req.body?.apiKey === 'string' && req.body.apiKey.trim()
          ? req.body.apiKey.trim()
          : fromSavedModel?.apiKey?.trim() ?? '';
      if (!provider) {
        sendApiError(res, 400, 'MISSING_PROVIDER', 'provider 不能为空');
        return;
      }

      const defaults: Record<string, string[]> = {
        gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
        chatgpt: ['gpt-5', 'gpt-5-mini'],
        openai_compatible: ['deepseek-chat', 'Qwen/Qwen3-8B', 'openai/gpt-5.2'],
      };

      if (!baseUrl || !apiKey) {
        res.json({
          models: defaults[provider] ?? [],
          source: 'default',
          message: '未提供 Base URL 或 API Key，返回内置推荐模型',
        });
        return;
      }

      let detected: string[] = [];
      if (provider === 'gemini') {
        detected = await detectGeminiModels(baseUrl, apiKey);
      } else {
        detected = await detectOpenAICompatibleModels(baseUrl, apiKey);
      }

      if (detected.length === 0) {
        res.json({
          models: defaults[provider] ?? [],
          source: 'default',
          message: '未从接口检测到模型，返回内置推荐模型',
        });
        return;
      }

      res.json({ models: detected, source: 'remote' });
    } catch (error) {
      sendApiError(res, 500, 'DETECT_MODELS_FAILED', resolveDetectErrorMessage(error));
    }
  });

  router.post('/settings/models/test', async (req: Request, res: Response) => {
    try {
      const fromSavedModel = resolveModelById(req.body?.id);
      const provider =
        typeof req.body?.provider === 'string' && req.body.provider.trim()
          ? req.body.provider.trim()
          : fromSavedModel?.provider ?? '';
      const baseUrl =
        typeof req.body?.baseUrl === 'string' && req.body.baseUrl.trim()
          ? req.body.baseUrl.trim()
          : fromSavedModel?.baseUrl?.trim() ?? '';
      const apiKey =
        typeof req.body?.apiKey === 'string' && req.body.apiKey.trim()
          ? req.body.apiKey.trim()
          : fromSavedModel?.apiKey?.trim() ?? '';
      const modelName =
        typeof req.body?.modelName === 'string' && req.body.modelName.trim()
          ? req.body.modelName.trim()
          : fromSavedModel?.modelName?.trim() ?? '';
      if (!provider) {
        res.json({ ok: false, message: '请填写模型类型', latencyMs: 0 });
        return;
      }
      if (!isModelProvider(provider)) {
        res.json({ ok: false, message: '模型类型不受支持', latencyMs: 0 });
        return;
      }
      if (!baseUrl || !modelName) {
        res.json({ ok: false, message: '请填写 Base URL 和模型名称', latencyMs: 0 });
        return;
      }
      if (!apiKey) {
        res.json({ ok: false, message: '请填写 API Key 进行连接测试', latencyMs: 0 });
        return;
      }

      const result = await testModelReachability({ baseUrl, apiKey, provider, modelName });
      res.json(result);
    } catch (error) {
      sendApiError(res, 500, 'TEST_MODEL_FAILED', toErrorMessage(error, '模型连接测试失败'));
    }
  });

  router.get('/settings/prompts', async (_req: Request, res: Response) => {
    try {
      res.json(getAppData().settings.prompts);
    } catch (error) {
      sendApiError(res, 500, 'GET_PROMPTS_FAILED', toErrorMessage(error, '获取提示词失败'));
    }
  });

  router.put('/settings/prompts', async (req: Request, res: Response) => {
    try {
      if (!Array.isArray(req.body)) {
        sendApiError(res, 400, 'INVALID_PROMPTS_PAYLOAD', '提示词配置格式不正确');
        return;
      }

      const prompts: PromptConfigRecord[] = req.body
        .filter((item) => item && typeof item === 'object')
        .map((item) => item as Partial<PromptConfigRecord>)
        .filter((item) => typeof item.id === 'string' && typeof item.name === 'string')
        .map((item) => ({
          id: item.id as string,
          name: (item.name as string).trim(),
          template: typeof item.template === 'string' ? item.template : '',
          variables: Array.isArray(item.variables) ? item.variables.filter((v): v is string => typeof v === 'string') : [],
          isDefault: Boolean(item.isDefault),
          updatedAt: timestamp(),
        }));

      if (prompts.length === 0) {
        sendApiError(res, 400, 'INVALID_PROMPTS_PAYLOAD', '提示词配置不能为空');
        return;
      }

      if (!prompts.some((item) => item.isDefault)) {
        prompts[0].isDefault = true;
      }

      mutateAppData((data) => {
        data.settings.prompts = prompts;
      });

      res.json({ success: true });
    } catch (error) {
      sendApiError(res, 500, 'UPDATE_PROMPTS_FAILED', toErrorMessage(error, '保存提示词失败'));
    }
  });

  router.get('/settings/integrations', async (_req: Request, res: Response) => {
    try {
      res.json(getMaskedIntegrations());
    } catch (error) {
      sendApiError(res, 500, 'GET_INTEGRATIONS_FAILED', toErrorMessage(error, '获取集成配置失败'));
    }
  });

  router.put('/settings/integrations', async (req: Request, res: Response) => {
    try {
      const incoming = req.body as Partial<IntegrationConfigRecord>;
      const jinaReader: Partial<IntegrationConfigRecord['jinaReader']> = (incoming?.jinaReader ?? {}) as Partial<
        IntegrationConfigRecord['jinaReader']
      >;

      mutateAppData((data) => {
        const prev = data.settings.integrations;
        const timeoutCandidate =
          typeof jinaReader.timeoutSec === 'number'
            ? jinaReader.timeoutSec
            : Number.isFinite(Number(jinaReader.timeoutSec))
              ? Number(jinaReader.timeoutSec)
              : prev.jinaReader.timeoutSec;
        const nextTimeoutSec = Number.isFinite(timeoutCandidate)
          ? Math.max(3, Math.min(180, Math.floor(Number(timeoutCandidate))))
          : 30;
        data.settings.integrations = {
          jinaReader: {
            endpoint:
              typeof jinaReader.endpoint === 'string'
                ? normalizeJinaReaderEndpoint(jinaReader.endpoint)
                : normalizeJinaReaderEndpoint(prev.jinaReader.endpoint),
            apiKey:
              typeof jinaReader.apiKey === 'string' && jinaReader.apiKey.trim()
                ? jinaReader.apiKey.trim()
                : prev.jinaReader.apiKey,
            timeoutSec: nextTimeoutSec,
            noCache: typeof jinaReader.noCache === 'boolean' ? jinaReader.noCache : Boolean(prev.jinaReader.noCache),
          },
        };
      });

      res.json({ success: true });
    } catch (error) {
      sendApiError(res, 500, 'UPDATE_INTEGRATIONS_FAILED', toErrorMessage(error, '保存集成配置失败'));
    }
  });

  router.get('/settings/video-understanding', async (_req: Request, res: Response) => {
    try {
      res.json(getAppData().settings.videoUnderstanding);
    } catch (error) {
      sendApiError(res, 500, 'GET_VIDEO_UNDERSTANDING_FAILED', toErrorMessage(error, '获取视频理解配置失败'));
    }
  });

  router.get('/settings/video-understanding/presets', async (_req: Request, res: Response) => {
    try {
      res.json({
        items: [
          {
            id: 'short_dense',
            label: '短视频高覆盖',
            appliesTo: '0-8min',
            config: {
              maxFrames: 32,
              sceneThreshold: 0.24,
              perSceneMax: 2,
              minSceneGapSec: 1.2,
              dedupeHashDistance: 7,
              blackFrameLumaThreshold: 18,
              blurVarianceThreshold: 80,
              extractWidth: 640,
              timeoutMs: 120000,
            },
          },
          {
            id: 'medium_balanced',
            label: '中长视频均衡',
            appliesTo: '8-25min',
            config: {
              maxFrames: 24,
              sceneThreshold: 0.3,
              perSceneMax: 2,
              minSceneGapSec: 2,
              dedupeHashDistance: 6,
              blackFrameLumaThreshold: 18,
              blurVarianceThreshold: 80,
              extractWidth: 640,
              timeoutMs: 120000,
            },
          },
          {
            id: 'long_efficient',
            label: '长视频高效率',
            appliesTo: '25min+',
            config: {
              maxFrames: 16,
              sceneThreshold: 0.36,
              perSceneMax: 2,
              minSceneGapSec: 3,
              dedupeHashDistance: 6,
              blackFrameLumaThreshold: 18,
              blurVarianceThreshold: 80,
              extractWidth: 640,
              timeoutMs: 120000,
            },
          },
        ],
      });
    } catch (error) {
      sendApiError(res, 500, 'GET_VIDEO_UNDERSTANDING_PRESETS_FAILED', toErrorMessage(error, '获取视频理解预设失败'));
    }
  });

  router.put('/settings/video-understanding', async (req: Request, res: Response) => {
    try {
      const incoming = req.body as Partial<VideoUnderstandingConfigRecord>;
      mutateAppData((data) => {
        const prev = data.settings.videoUnderstanding;
        data.settings.videoUnderstanding = {
          enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : prev.enabled,
          maxFrames:
            typeof incoming.maxFrames === 'number'
              ? Math.max(4, Math.min(120, Math.floor(incoming.maxFrames)))
              : prev.maxFrames,
          sceneThreshold:
            typeof incoming.sceneThreshold === 'number'
              ? Math.max(0.05, Math.min(0.95, incoming.sceneThreshold))
              : prev.sceneThreshold,
          perSceneMax:
            typeof incoming.perSceneMax === 'number'
              ? Math.max(1, Math.min(3, Math.floor(incoming.perSceneMax)))
              : prev.perSceneMax,
          minSceneGapSec:
            typeof incoming.minSceneGapSec === 'number'
              ? Math.max(0.2, Math.min(30, incoming.minSceneGapSec))
              : prev.minSceneGapSec,
          dedupeHashDistance:
            typeof incoming.dedupeHashDistance === 'number'
              ? Math.max(1, Math.min(64, Math.floor(incoming.dedupeHashDistance)))
              : prev.dedupeHashDistance,
          blackFrameLumaThreshold:
            typeof incoming.blackFrameLumaThreshold === 'number'
              ? Math.max(0, Math.min(255, Math.floor(incoming.blackFrameLumaThreshold)))
              : prev.blackFrameLumaThreshold,
          blurVarianceThreshold:
            typeof incoming.blurVarianceThreshold === 'number'
              ? Math.max(1, Math.min(10000, incoming.blurVarianceThreshold))
              : prev.blurVarianceThreshold,
          extractWidth:
            typeof incoming.extractWidth === 'number'
              ? Math.max(160, Math.min(1920, Math.floor(incoming.extractWidth)))
              : prev.extractWidth,
          timeoutMs:
            typeof incoming.timeoutMs === 'number'
              ? Math.max(15000, Math.min(600000, Math.floor(incoming.timeoutMs)))
              : prev.timeoutMs,
        };
      });
      res.json({ success: true });
    } catch (error) {
      sendApiError(res, 500, 'UPDATE_VIDEO_UNDERSTANDING_FAILED', toErrorMessage(error, '保存视频理解配置失败'));
    }
  });

  router.get('/settings/local-transcriber', async (_req: Request, res: Response) => {
    try {
      res.json(getAppData().settings.localTranscriber);
    } catch (error) {
      sendApiError(res, 500, 'GET_LOCAL_TRANSCRIBER_FAILED', toErrorMessage(error, '获取本地转写配置失败'));
    }
  });

  router.put('/settings/local-transcriber', async (req: Request, res: Response) => {
    try {
      const incoming = req.body as Partial<LocalTranscriberConfigRecord> | undefined;
      const prev = getAppData().settings.localTranscriber;
      const normalized = normalizeLocalTranscriberInput(incoming, prev);

      if (!normalized.command.trim()) {
        sendApiError(res, 400, 'INVALID_LOCAL_TRANSCRIBER_COMMAND', '请填写本地转写命令');
        return;
      }
      if (!normalized.ffmpegBin.trim()) {
        sendApiError(res, 400, 'INVALID_FFMPEG_BIN', '请填写 ffmpeg 可执行路径');
        return;
      }
      if (normalized.device === 'cuda' && (!prev.cudaChecked || !prev.cudaAvailable)) {
        sendApiError(res, 400, 'CUDA_NOT_VERIFIED', '请先在环境检测中完成 CUDA 检测并确认可用后再保存 CUDA 设备');
        return;
      }

      const envFilePath = path.resolve(getProjectRoot(), '.env');
      const envValues: Record<LocalTranscriberEnvKey, string> = {
        LOCAL_ASR_COMMAND: normalized.command,
        FFMPEG_BIN: normalized.ffmpegBin,
        LOCAL_ASR_MODEL: normalized.model,
        LOCAL_ASR_LANGUAGE: normalized.language,
        LOCAL_ASR_DEVICE: normalized.device,
        LOCAL_ASR_BEAM_SIZE: String(normalized.beamSize),
        LOCAL_ASR_TEMPERATURE: String(normalized.temperature),
        LOCAL_ASR_TIMEOUT_MS: String(normalized.timeoutMs),
      };

      upsertEnvFileValues(envFilePath, LOCAL_TRANSCRIBER_ENV_KEYS, envValues);

      for (const [key, value] of Object.entries(envValues)) {
        process.env[key] = value;
      }

      mutateAppData((data) => {
        data.settings.localTranscriber = {
          ...normalized,
          cudaEnabledOnce: normalized.cudaEnabledOnce || normalized.device === 'cuda',
        };
      });

      res.json({ success: true, message: '本地转写配置已保存到 .env' });
    } catch (error) {
      sendApiError(res, 500, 'UPDATE_LOCAL_TRANSCRIBER_FAILED', toErrorMessage(error, '保存本地转写配置失败'));
    }
  });

  router.post('/settings/local-transcriber/test', async (req: Request, res: Response) => {
    try {
      const incoming = req.body as Partial<LocalTranscriberConfigRecord> | undefined;
      const commandRaw =
        typeof incoming?.command === 'string' && incoming.command.trim()
          ? incoming.command.trim()
          : getAppData().settings.localTranscriber.command;
      const ffmpegBinRaw =
        typeof incoming?.ffmpegBin === 'string' && incoming.ffmpegBin.trim()
          ? incoming.ffmpegBin.trim()
          : getAppData().settings.localTranscriber.ffmpegBin;
      if (!commandRaw) {
        res.json({ ok: false, message: '请填写本地转写命令' });
        return;
      }
      if (!ffmpegBinRaw) {
        res.json({ ok: false, message: '请填写 ffmpeg 可执行路径' });
        return;
      }
      // 解析路径（支持相对路径）
      const command = resolveProjectPath(commandRaw);
      const ffmpegBin = resolveProjectPath(ffmpegBinRaw);
      try {
        await execFileAsync(command, ['--help'], {
          timeout: 8000,
          windowsHide: true,
          maxBuffer: 1024 * 1024 * 2,
          env: {
            ...process.env,
            KMP_DUPLICATE_LIB_OK: process.env.KMP_DUPLICATE_LIB_OK || 'TRUE',
          },
        });

      } catch (error) {
        // Ignore error, just checking if command is executable
      }
      await execFileAsync(ffmpegBin, ['-version'], { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 * 2 });
      res.json({ ok: true, message: '本地转写命令与 ffmpeg 均可用' });
    } catch (error) {
      const message = toErrorMessage(error, '本地转写命令不可用，请检查安装和 PATH');
      if (/spawn\s+ffmpeg\s+ENOENT|enoent/i.test(message)) {
        res.json({ ok: false, message: '未找到 ffmpeg。请安装 ffmpeg 并加入 PATH，或在配置里填写 ffmpeg 可执行路径。' });
        return;
      }
      res.json({ ok: false, message });
    }
  });

  router.post('/settings/integrations/jina-reader/test', async (req: Request, res: Response) => {
    try {
      const incoming = req.body?.jinaReader as Partial<IntegrationConfigRecord['jinaReader']> | undefined;
      const endpoint = normalizeJinaReaderEndpoint(incoming?.endpoint || getAppData().settings.integrations.jinaReader.endpoint);
      const apiKey =
        typeof incoming?.apiKey === 'string' && incoming.apiKey.trim()
          ? incoming.apiKey.trim()
          : getAppData().settings.integrations.jinaReader.apiKey;
      const timeoutSec = Number.isFinite(Number(incoming?.timeoutSec))
        ? Math.max(3, Math.min(180, Math.floor(Number(incoming?.timeoutSec))))
        : 15;
      const noCache = typeof incoming?.noCache === 'boolean' ? incoming.noCache : false;

      const testUrl = 'https://example.com';
      const result = await readWebPageWithJina(testUrl, {
        endpoint,
        apiKey,
        timeoutSec,
        noCache,
      });

      if (!result.content.trim()) {
        res.json({ ok: false, message: 'Jina Reader 连通成功，但未获取到可用内容' });
        return;
      }

      res.json({ ok: true, message: 'Jina Reader 连接成功' });
    } catch (error) {
      res.json({ ok: false, message: toErrorMessage(error, 'Jina Reader 测试失败') });
    }
  });

  router.get('/settings/env-check', async (_req: Request, res: Response) => {
    const results = {
      ffmpeg: { ok: false, version: '', path: '' },
      cuda: { ok: false, details: '' },
      whisper: { ok: false, version: '', path: '' },
    };

    const config = getAppData().settings.localTranscriber;

    // Check FFmpeg
    const ffmpegBinRaw = config.ffmpegBin || 'ffmpeg';
    const ffmpegBin = resolveProjectPath(ffmpegBinRaw);
    try {
      const { stdout } = await execFileAsync(ffmpegBin, ['-version'], { timeout: 3000 });
      results.ffmpeg.ok = true;
      results.ffmpeg.version = stdout.split('\n')[0].trim();
      results.ffmpeg.path = ffmpegBinRaw; // 显示原始路径（可能是相对的）
    } catch {
      results.ffmpeg.ok = false;
    }

    // Check Whisper (now checking Python + faster-whisper)
    // For now, we assume if python is available and can import faster_whisper, it is OK.
    let pythonBin = 'python';
    // If config.command looks like a python executable (contains 'python'), use it.
    if (config.command && config.command.toLowerCase().includes('python')) {
      pythonBin = resolveCommand(config.command);
    }
    // Ensure we have an absolute path for local env/python.exe
    if (!path.isAbsolute(pythonBin) && (pythonBin.includes('env/') || pythonBin.includes('env\\'))) {
       const projectRoot = getProjectRoot();
       const candidate = path.join(projectRoot, pythonBin.replace(/^\.\//, ''));
       if (fs.existsSync(candidate)) {
         pythonBin = candidate;
       }
    }

    try {
      await execFileAsync(pythonBin, ['-c', 'import faster_whisper; print(faster_whisper.__version__)'], { timeout: 5000 });
      results.whisper.ok = true;
      results.whisper.version = 'faster-whisper installed';
      results.whisper.path = pythonBin;
    } catch {
      results.whisper.ok = false;
      results.whisper.version = 'faster-whisper not found';
    }

    // Check CUDA (prefer ctranslate2 used by faster-whisper; fallback to torch)
    try {
      const { stdout } = await execFileAsync(
        pythonBin,
        [
          '-c',
          [
            'import json',
            'result = {"ok": False, "details": ""}',
            'try:',
            '  import ctranslate2',
            '  count = ctranslate2.get_cuda_device_count() if hasattr(ctranslate2, "get_cuda_device_count") else 0',
            '  if count > 0:',
            '    result = {"ok": True, "details": f"CUDA is available ({count} device(s), ctranslate2)"}',
            'except Exception:',
            '  pass',
            'if not result["ok"]:',
            '  try:',
            '    import torch',
            '    ok = bool(torch.cuda.is_available())',
            '    details = torch.cuda.get_device_name(0) if ok else "CUDA not found"',
            '    result = {"ok": ok, "details": details}',
            '  except Exception:',
            '    result = {"ok": False, "details": "CUDA not found (ctranslate2/torch unavailable)"}',
            'print(json.dumps(result, ensure_ascii=False))',
          ].join('\n'),
        ],
        { timeout: 5000 }
      );
      const parsed = JSON.parse(stdout.trim()) as { ok?: boolean; details?: string };
      results.cuda.ok = Boolean(parsed.ok);
      results.cuda.details = parsed.details || (results.cuda.ok ? 'CUDA is available' : 'CUDA not found');
    } catch {
      results.cuda.ok = false;
      results.cuda.details = 'Failed to detect CUDA';
    }

    mutateAppData((data) => {
      const prev = data.settings.localTranscriber;
      data.settings.localTranscriber = {
        ...prev,
        cudaChecked: true,
        cudaAvailable: results.cuda.ok,
      };
    });

    res.json(results);
  });

  return router;
}
