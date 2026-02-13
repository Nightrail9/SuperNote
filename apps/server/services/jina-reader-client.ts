export type JinaReaderConfig = {
  endpoint?: string;
  apiKey?: string;
  timeoutSec?: number;
  noCache?: boolean;
  signal?: AbortSignal;
};

export type JinaReaderResult = {
  url: string;
  title?: string;
  content: string;
};

const DEFAULT_JINA_READER_ENDPOINT = 'https://r.jina.ai/';
const DEFAULT_TIMEOUT_MS = 30000;

function normalizeEndpoint(value?: string): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_JINA_READER_ENDPOINT;
  const normalizedRaw = raw.endsWith('/') ? raw : `${raw}/`;

  try {
    const parsed = new URL(normalizedRaw);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (
      host === 'jina.ai' &&
      (path.startsWith('/api-dashboard/reader') || path.startsWith('/reader') || path === '/')
    ) {
      return DEFAULT_JINA_READER_ENDPOINT;
    }

    return `${parsed.protocol}//${parsed.host}${parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`}`;
  } catch {
    return normalizedRaw;
  }
}

function resolveTimeoutMs(timeoutSec?: number): number {
  if (!Number.isFinite(timeoutSec) || timeoutSec === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }
  const normalized = Math.max(3, Math.min(180, Math.floor(timeoutSec)));
  return normalized * 1000;
}

function buildReaderUrl(endpoint: string, targetUrl: string): string {
  const normalizedTarget = targetUrl.trim();
  return `${endpoint}${normalizedTarget}`;
}

function parseReaderResponse(rawText: string, url: string): JinaReaderResult {
  const text = rawText.replace(/\r\n/g, '\n').trim();
  if (!text) {
    return { url, content: '' };
  }

  const lines = text.split('\n');
  let title = '';
  let markdownStart = 0;

  for (let index = 0; index < lines.length; index++) {
    const current = lines[index]?.trim();
    if (current === 'Markdown Content:' || current === 'Markdown:') {
      markdownStart = index + 1;
      break;
    }
    if (current.startsWith('Title:')) {
      title = current.replace(/^Title:\s*/, '').trim();
    }
  }

  const content = lines.slice(markdownStart).join('\n').trim() || text;
  return {
    url,
    title: title || undefined,
    content,
  };
}

export async function readWebPageWithJina(url: string, config?: JinaReaderConfig): Promise<JinaReaderResult> {
  const endpoint = normalizeEndpoint(config?.endpoint);
  const requestUrl = buildReaderUrl(endpoint, url);
  const timeoutMs = resolveTimeoutMs(config?.timeoutSec);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const externalAbort = () => controller.abort();
  if (config?.signal) {
    if (config.signal.aborted) {
      controller.abort();
    } else {
      config.signal.addEventListener('abort', externalAbort, { once: true });
    }
  }

  try {
    const headers: Record<string, string> = {
      Accept: 'text/plain',
    };

    if (config?.apiKey?.trim()) {
      headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    }
    if (config?.noCache) {
      headers['x-no-cache'] = 'true';
    }
    if (Number.isFinite(config?.timeoutSec)) {
      headers['x-timeout'] = String(Math.max(3, Math.min(180, Math.floor(config?.timeoutSec ?? 0))));
    }

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    const responseText = await response.text();
    if (/^\s*<!doctype\s+html/i.test(responseText)) {
      throw new Error('Jina Reader 返回了 HTML 页面，请确认 Endpoint 使用 https://r.jina.ai/');
    }
    if (!response.ok) {
      throw new Error(`Jina Reader 请求失败(${response.status}): ${response.statusText || responseText.slice(0, 120)}`);
    }

    return parseReaderResponse(responseText, url);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (config?.signal?.aborted) {
        throw new Error('任务已取消');
      }
      throw new Error('网页抓取超时，请稍后重试');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (config?.signal) {
      config.signal.removeEventListener('abort', externalAbort);
    }
  }
}

export function normalizeJinaReaderEndpoint(endpoint?: string): string {
  return normalizeEndpoint(endpoint);
}
