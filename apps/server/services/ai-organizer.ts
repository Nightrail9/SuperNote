/**
 * AI Organizer Service
 *
 * Standalone service for forwarding markdown content to a user-configured AI API
 * for note organization. Extracted from the organize-notes route handler.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { logDiagnostic, logDiagnosticError } from './diagnostic-logger.js';
import { getErrorMessage } from '../utils/error-messages.js';
import { normalizeBaseUrl, isGeminiNativeUrl } from '../utils/url-helpers.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration for an AI organize request.
 */
export interface AIOrganizeConfig {
  /** AI API endpoint URL (HTTPS) */
  apiUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Provider type */
  provider?: 'gemini' | 'chatgpt' | 'openai_compatible' | string;
  /** Model name */
  modelName?: string;
  /** User-provided prompt for organizing notes */
  prompt: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeoutMs?: number;
  /** External abort signal (optional) */
  abortSignal?: AbortSignal;
  /** Optional image file paths for multimodal models */
  imagePaths?: string[];
}

type InlineImage = {
  mimeType: string;
  base64Data: string;
};

/**
 * Result of an AI organize operation.
 */
export interface AIOrganizeResult {
  success: boolean;
  /** Organized content returned by the AI API on success */
  content?: string;
  /** Error details on failure */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Interface for the AI Organizer service.
 */
export interface AIOrganizer {
  organize(markdown: string, config: AIOrganizeConfig): Promise<AIOrganizeResult>;
}

/** Default timeout for AI API requests: 60 seconds */
const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TIMEOUT_RETRIES = 1;

const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  gemini: 'gemini-2.5-flash',
  chatgpt: 'gpt-5-mini',
  openai_compatible: 'gpt-4o-mini',
};

function normalizeProvider(config: AIOrganizeConfig): 'gemini' | 'chatgpt' | 'openai_compatible' {
  const provider = (config.provider ?? '').trim().toLowerCase();
  if (provider === 'gemini' || provider === 'chatgpt' || provider === 'openai_compatible') {
    return provider;
  }
  if (isGeminiNativeUrl(config.apiUrl)) {
    return 'gemini';
  }
  return 'openai_compatible';
}

function normalizeOpenAIBase(baseUrl: string): string {
  let normalized = normalizeBaseUrl(baseUrl);
  normalized = normalized.replace(/\/(chat\/completions|completions|responses)$/i, '');
  if (/\/v\d+$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}/v1`;
}

function buildOpenAIChatEndpoint(baseUrl: string): string {
  const normalized = normalizeOpenAIBase(baseUrl);
  return `${normalized}/chat/completions`;
}

function buildGeminiNativeEndpoint(baseUrl: string, modelName: string): string {
  const normalized = normalizeBaseUrl(baseUrl).replace(/\/openai$/i, '');
  return `${normalized}/models/${encodeURIComponent(modelName)}:generateContent`;
}

function resolveModelName(provider: string, modelName?: string): string {
  const normalized = modelName?.trim();
  if (normalized) {
    return normalized;
  }
  return DEFAULT_MODEL_BY_PROVIDER[provider] ?? DEFAULT_MODEL_BY_PROVIDER.openai_compatible;
}

function buildOpenAIPayload(markdown: string, config: AIOrganizeConfig, modelName: string): Record<string, unknown> {
  const images = loadInlineImages(config.imagePaths);
  const userContent =
    images.length > 0
      ? [
          {
            type: 'text',
            text: markdown,
          },
          ...images.map((item) => ({
            type: 'image_url',
            image_url: {
              url: `data:${item.mimeType};base64,${item.base64Data}`,
            },
          })),
        ]
      : markdown;

  return {
    model: modelName,
    messages: [
      {
        role: 'system',
        content: config.prompt,
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    temperature: 0.2,
  };
}

function buildGeminiNativePayload(markdown: string, config: AIOrganizeConfig): Record<string, unknown> {
  const images = loadInlineImages(config.imagePaths);
  const parts: Array<Record<string, unknown>> = [
    {
      text: `${config.prompt}\n\n${markdown}`,
    },
  ];

  for (const image of images) {
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.base64Data,
      },
    });
  }

  return {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
  };
}

function detectImageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') {
    return 'image/png';
  }
  if (ext === '.webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function loadInlineImages(imagePaths: string[] | undefined): InlineImage[] {
  if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
    return [];
  }

  const images: InlineImage[] = [];
  for (const imagePath of imagePaths) {
    if (typeof imagePath !== 'string' || !imagePath.trim()) {
      continue;
    }
    const normalizedPath = imagePath.trim();
    if (!fs.existsSync(normalizedPath)) {
      continue;
    }
    const binary = fs.readFileSync(normalizedPath);
    if (!binary.length) {
      continue;
    }
    images.push({
      mimeType: detectImageMimeType(normalizedPath),
      base64Data: binary.toString('base64'),
    });
  }
  return images;
}

function maybeMultimodalUnsupported(message: string): boolean {
  const text = message.toLowerCase();
  return (
    (text.includes('image') && text.includes('support')) ||
    text.includes('vision') ||
    text.includes('multimodal') ||
    text.includes('does not support image') ||
    text.includes('input_image') ||
    text.includes('inline_data')
  );
}

/**
 * Map HTTP status codes to application-specific error codes.
 *
 * Reuses the mapping logic originally in organize-notes.ts.
 *
 * @param status - HTTP status code from the AI API response
 * @returns Application error code string
 *
 * Requirements: 4.3, 4.4
 */
export function mapHttpStatusToErrorCode(status: number): string {
  switch (status) {
    case 401:
      return 'INVALID_API_KEY';
    case 429:
      return 'RATE_LIMIT_EXCEEDED';
    case 500:
    case 502:
    case 503:
      return 'API_SERVER_ERROR';
    case 504:
      return 'CONNECTION_TIMEOUT';
    default:
      return 'API_ERROR';
  }
}

/**
 * Extract organized content from an AI API response.
 *
 * Supports multiple response field names: `organizedNotes`, `content`, or `result`.
 * Returns an empty string if none of the expected fields are present.
 *
 * @param responseBody - Parsed JSON body from the AI API
 * @returns The extracted content string
 *
 * Requirements: 4.2
 */
export function extractContent(responseBody: Record<string, unknown>): string {
  if (typeof responseBody.organizedNotes === 'string') {
    return responseBody.organizedNotes;
  }
  if (typeof responseBody.content === 'string') {
    return responseBody.content;
  }
  if (typeof responseBody.result === 'string') {
    return responseBody.result;
  }
  const choices = responseBody.choices;
  if (Array.isArray(choices)) {
    const first = choices[0];
    if (first && typeof first === 'object') {
      const firstRecord = first as Record<string, unknown>;
      const message = firstRecord.message;
      if (message && typeof message === 'object') {
        const text = (message as Record<string, unknown>).content;
        if (typeof text === 'string') {
          return text;
        }
        if (Array.isArray(text)) {
          const merged = text
            .map((item) => {
              if (!item || typeof item !== 'object') {
                return '';
              }
              const record = item as Record<string, unknown>;
              if (typeof record.text === 'string') {
                return record.text;
              }
              if (typeof record.output_text === 'string') {
                return record.output_text;
              }
              return '';
            })
            .filter(Boolean)
            .join('\n');
          if (merged) {
            return merged;
          }
        }
      }
      const text = firstRecord.text;
      if (typeof text === 'string') {
        return text;
      }
    }
  }

  const candidates = responseBody.candidates;
  if (Array.isArray(candidates)) {
    const firstCandidate = candidates[0];
    if (firstCandidate && typeof firstCandidate === 'object') {
      const content = (firstCandidate as Record<string, unknown>).content;
      if (content && typeof content === 'object') {
        const parts = (content as Record<string, unknown>).parts;
        if (Array.isArray(parts)) {
          const text = parts
            .map((item) => {
              if (!item || typeof item !== 'object') {
                return '';
              }
              const partText = (item as Record<string, unknown>).text;
              return typeof partText === 'string' ? partText : '';
            })
            .filter(Boolean)
            .join('\n');
          if (text) {
            return text;
          }
        }
      }
    }
  }

  return '';
}

/**
 * Default implementation of the AIOrganizer interface.
 *
 * Sends markdown content along with a user prompt to the configured AI API,
 * handles timeouts, HTTP errors, and network failures, and extracts the
 * organized content from the response.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
export class DefaultAIOrganizer implements AIOrganizer {
  /**
   * Organize markdown content via an AI API.
   *
   * @param markdown - The markdown content to organize
   * @param config - AI API configuration (url, key, prompt, optional timeout)
   * @returns AIOrganizeResult with success/content or error details
   */
  async organize(markdown: string, config: AIOrganizeConfig): Promise<AIOrganizeResult> {
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const provider = normalizeProvider(config);
    const modelName = resolveModelName(provider, config.modelName);
    const startedAt = Date.now();

    const useGeminiNative = provider === 'gemini' && isGeminiNativeUrl(config.apiUrl);
    const requestUrl = useGeminiNative
      ? buildGeminiNativeEndpoint(config.apiUrl, modelName)
      : buildOpenAIChatEndpoint(config.apiUrl);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (useGeminiNative) {
      headers['x-goog-api-key'] = config.apiKey;
    } else {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const payload = useGeminiNative
      ? buildGeminiNativePayload(markdown, config)
      : buildOpenAIPayload(markdown, config, modelName);

    const maxAttempts = 1 + MAX_TIMEOUT_RETRIES;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const externalAbort = () => controller.abort();

      if (config.abortSignal) {
        if (config.abortSignal.aborted) {
          controller.abort();
        } else {
          config.abortSignal.addEventListener('abort', externalAbort, { once: true });
        }
      }

      try {
        logDiagnostic('info', 'ai-organizer', 'request_started', {
          provider,
          modelName,
          timeoutMs,
          requestUrl,
          markdownLength: markdown.length,
          attempt,
          maxAttempts,
        });

        const response = await fetch(requestUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const rawBody = await response.text();
        const parsedBody = this.tryParseJson(rawBody);

        if (!response.ok) {
          let errorCode = mapHttpStatusToErrorCode(response.status);
          const fallbackMessage = getErrorMessage(errorCode).message;
          let errorMessage = this.resolveApiErrorMessage(parsedBody, fallbackMessage);
          if (
            config.imagePaths?.length &&
            (maybeMultimodalUnsupported(errorMessage) || response.status === 400 || response.status === 422)
          ) {
            errorCode = 'UNSUPPORTED_MULTIMODAL';
            errorMessage = '当前模型不支持图片输入，请更换支持视觉的模型后重试。';
          }
          logDiagnostic('warn', 'ai-organizer', 'request_failed_http', {
            provider,
            modelName,
            timeoutMs,
            requestUrl,
            httpStatus: response.status,
            elapsedMs: Date.now() - startedAt,
            errorCode,
            errorMessage,
            attempt,
            maxAttempts,
          });
          return {
            success: false,
            error: {
              code: errorCode,
              message: errorMessage,
            },
          };
        }

        if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
          const htmlLike = /^\s*<!doctype\s+html/i.test(rawBody);
          return {
            success: false,
            error: {
              code: 'API_ERROR',
              message: htmlLike
                ? '模型接口返回了 HTML 页面，请检查 Base URL 是否为 API 地址（而非网页地址）'
                : '模型接口返回了非 JSON 响应，请检查 Base URL 与接口格式',
            },
          };
        }

        const body = parsedBody as Record<string, unknown>;
        const content = extractContent(body);

        return {
          success: true,
          content,
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          const externalAborted = Boolean(config.abortSignal?.aborted);
          const canRetry = !externalAborted && attempt < maxAttempts;

          if (canRetry) {
            logDiagnostic('warn', 'ai-organizer', 'request_timeout_retry', {
              provider,
              modelName,
              timeoutMs,
              elapsedMs: Date.now() - startedAt,
              attempt,
              maxAttempts,
            });
            continue;
          }

          const errorMessage = getErrorMessage('CONNECTION_TIMEOUT').message;
          logDiagnostic('warn', 'ai-organizer', 'request_timeout', {
            provider,
            modelName,
            timeoutMs,
            elapsedMs: Date.now() - startedAt,
            attempt,
            maxAttempts,
          });
          return {
            success: false,
            error: {
              code: 'CONNECTION_TIMEOUT',
              message: errorMessage,
            },
          };
        }

        const errorMessage = err instanceof Error
          ? err.message
          : getErrorMessage('CONNECTION_ERROR').message;
        logDiagnosticError('ai-organizer', 'request_failed_network', err, {
          provider,
          modelName,
          timeoutMs,
          elapsedMs: Date.now() - startedAt,
          attempt,
          maxAttempts,
        });
        return {
          success: false,
          error: {
            code: 'CONNECTION_ERROR',
            message: errorMessage,
          },
        };
      } finally {
        clearTimeout(timeoutId);
        if (config.abortSignal) {
          config.abortSignal.removeEventListener('abort', externalAbort);
        }
      }
    }

    return {
      success: false,
      error: {
        code: 'CONNECTION_TIMEOUT',
        message: getErrorMessage('CONNECTION_TIMEOUT').message,
      },
    };
  }

  private tryParseJson(raw: string): unknown {
    const text = raw.trim();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  private resolveApiErrorMessage(parsedBody: unknown, fallbackMessage: string): string {
    if (!parsedBody || typeof parsedBody !== 'object') {
      return fallbackMessage;
    }
    const body = parsedBody as Record<string, unknown>;
    const directMessage = body.message;
    if (typeof directMessage === 'string' && directMessage.trim()) {
      return directMessage;
    }
    const error = body.error;
    if (error && typeof error === 'object') {
      const nestedMessage = (error as Record<string, unknown>).message;
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        return nestedMessage;
      }
    }
    return fallbackMessage;
  }
}
