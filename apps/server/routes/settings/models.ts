import { Router } from 'express';

import { TIMEOUTS } from '../../constants/index.js';
import { DefaultAIOrganizer } from '../../services/ai-organizer.js';
import { maskSecret, type ModelConfigRecord } from '../../services/app-data-store.js';
import { getModels, normalizeModelPayload, saveModels } from '../../services/settings-store/index.js';
import { sendApiError, toErrorMessage } from '../../utils/http-error.js';
import { createAbortSignal } from '../../utils/retry.js';
import { isGeminiNativeUrl, normalizeBaseUrl, stripApiPath } from '../../utils/url-helpers.js';
import type { Request, Response } from 'express';

function buildOpenAIModelsEndpoint(baseUrl: string): string {
  const normalized = stripApiPath(baseUrl);
  return `${normalized}/models`;
}

function buildGeminiModelsEndpoint(baseUrl: string, apiKey: string): string {
  let normalized = normalizeBaseUrl(baseUrl);
  if (isGeminiNativeUrl(normalized)) {
    normalized = normalized.replace(/\/openai$/i, '');
    return `${normalized}/models?key=${encodeURIComponent(apiKey)}`;
  }
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
    const payload = await requestJson(endpoint, {
      headers: { Accept: 'application/json', 'x-goog-api-key': apiKey },
    });
    const data = payload as { models?: unknown };
    return normalizeDetectedModelNames(data.models).filter((name) => name.toLowerCase().includes('gemini'));
  }

  const payload = await requestJson(endpoint, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  const data = payload as { data?: unknown; models?: unknown };
  return normalizeDetectedModelNames(Array.isArray(data.data) ? data.data : data.models);
}

function getMaskedModels(): Array<ModelConfigRecord & { apiKeyMasked?: string }> {
  return getModels().map((item) => ({
    ...item,
    apiKeyMasked: maskSecret(item.apiKey),
  }));
}

function resolveModelById(value: unknown): ModelConfigRecord | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const id = value.trim();
  return getModels().find((item) => item.id === id);
}

function isModelProvider(value: string): value is ModelConfigRecord['provider'] {
  return value === 'gemini' || value === 'chatgpt' || value === 'openai_compatible';
}

function collectApiKeyPatchMap(rawPayload: unknown): Map<string, string> {
  const patchMap = new Map<string, string>();
  if (!Array.isArray(rawPayload)) {
    return patchMap;
  }

  for (const item of rawPayload) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!id || !Object.prototype.hasOwnProperty.call(record, 'apiKey')) {
      continue;
    }
    if (typeof record.apiKey !== 'string') {
      throw new Error('API_KEY_NOT_STRING');
    }
    patchMap.set(id, record.apiKey.trim());
  }

  return patchMap;
}

export function createSettingsModelsRouter(): Router {
  const router = Router();

  router.get('/models', async (_req: Request, res: Response) => {
    try {
      res.json(getMaskedModels());
    } catch (error) {
      sendApiError(res, 500, 'GET_MODELS_FAILED', toErrorMessage(error, '获取模型配置失败'));
    }
  });

  router.put('/models', async (req: Request, res: Response) => {
    try {
      const payload = normalizeModelPayload(req.body);
      if (!payload || payload.length === 0) {
        sendApiError(res, 400, 'INVALID_MODELS_PAYLOAD', '模型配置格式不正确');
        return;
      }

      const apiKeyPatchMap = collectApiKeyPatchMap(req.body);

      const existingById = new Map(getModels().map((item) => [item.id, item]));
      const merged: ModelConfigRecord[] = payload.map((item) => {
        const prev = existingById.get(item.id);
        const hasApiKeyPatch = apiKeyPatchMap.has(item.id);
        return {
          ...item,
          apiKey: hasApiKeyPatch ? apiKeyPatchMap.get(item.id) : prev?.apiKey,
        };
      });

      if (!merged.some((item) => item.isDefault) && merged.length > 0) {
        merged[0].isDefault = true;
      }

      saveModels(merged);
      res.json({ success: true });
    } catch (error) {
      if (toErrorMessage(error, '').includes('API_KEY_NOT_STRING')) {
        sendApiError(res, 400, 'INVALID_MODEL_API_KEY', '模型 API Key 格式不正确');
        return;
      }
      sendApiError(res, 500, 'UPDATE_MODELS_FAILED', toErrorMessage(error, '保存模型配置失败'));
    }
  });

  router.post('/models/detect', async (req: Request, res: Response) => {
    try {
      const fromSavedModel = resolveModelById(req.body?.id);
      const provider = typeof req.body?.provider === 'string' ? req.body.provider : fromSavedModel?.provider ?? '';
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

      const detected = provider === 'gemini'
        ? await detectGeminiModels(baseUrl, apiKey)
        : await detectOpenAICompatibleModels(baseUrl, apiKey);

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

  router.post('/models/test', async (req: Request, res: Response) => {
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

  return router;
}
