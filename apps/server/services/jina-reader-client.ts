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
const MAX_ATTEMPTS_PER_CANDIDATE = 2;
const RETRY_BACKOFF_MS = [300, 900];

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

function toHttpFallbackUrl(url: string): string | undefined {
  if (!/^https:\/\//i.test(url)) {
    return undefined;
  }
  return url.replace(/^https:/i, 'http:');
}

function buildTargetCandidates(url: string): string[] {
  const normalized = url.trim();
  if (!normalized) {
    return [];
  }

  const fallback = toHttpFallbackUrl(normalized);
  if (fallback && fallback !== normalized) {
    return [normalized, fallback];
  }

  return [normalized];
}

function countSignalMatches(input: string, patterns: RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    if (pattern.test(input)) {
      count += 1;
    }
  }
  return count;
}

function isLikelyShellContent(result: JinaReaderResult, rawText: string): boolean {
  const source = `${rawText}\n${result.content}`.toLowerCase();
  const hasLoading = /\bloading\.\.\./i.test(source);
  const hasSkipToMain = /skip to main content/i.test(source);
  const navSignalCount = countSignalMatches(source, [
    /toggle navigation menu/i,
    /\[home\]\(/i,
    /\[articles\]\(/i,
    /\[podcasts\]\(/i,
    /\[videos\]\(/i,
    /\[tweets\]\(/i,
    /\[sources\]\(/i,
    /\[newsletters\]\(/i,
    /change language/i,
    /switch theme/i,
    /\[sign in\]\(/i,
  ]);
  const shortContent = result.content.trim().length < 1800;

  if (hasLoading && hasSkipToMain && navSignalCount >= 4) {
    return true;
  }

  if (shortContent && hasSkipToMain && navSignalCount >= 6) {
    return true;
  }

  return false;
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function resolveBackoffMs(attempt: number): number {
  if (attempt <= 0) {
    return RETRY_BACKOFF_MS[0] ?? 300;
  }
  return RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)] ?? 900;
}

async function waitWithAbort(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      const abortError = new Error('TASK_CANCELLED');
      abortError.name = 'AbortError';
      reject(abortError);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
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
  const targetCandidates = buildTargetCandidates(url);
  if (!targetCandidates.length) {
    throw new Error('网页链接为空或格式不正确');
  }
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

    let lastError: Error | undefined;

    for (let candidateIndex = 0; candidateIndex < targetCandidates.length; candidateIndex++) {
      const currentTarget = targetCandidates[candidateIndex] as string;
      const hasNextCandidate = candidateIndex < targetCandidates.length - 1;
      const requestUrl = buildReaderUrl(endpoint, currentTarget);

      for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CANDIDATE; attempt++) {
        try {
          const response = await fetch(requestUrl, {
            method: 'GET',
            headers,
            signal: controller.signal,
          });

          const responseText = await response.text();
          if (/^\s*<!doctype\s+html/i.test(responseText)) {
            lastError = new Error('Jina Reader 返回了 HTML 页面，请确认 Endpoint 使用 https://r.jina.ai/');
            break;
          }

          if (!response.ok) {
            lastError = new Error(
              `Jina Reader 请求失败(${response.status}): ${response.statusText || responseText.slice(0, 120)}`,
            );
            if (shouldRetryStatus(response.status) && attempt < MAX_ATTEMPTS_PER_CANDIDATE) {
              await waitWithAbort(resolveBackoffMs(attempt), controller.signal);
              continue;
            }
            break;
          }

          const parsed = parseReaderResponse(responseText, url);
          if (isLikelyShellContent(parsed, responseText)) {
            lastError = new Error('Jina Reader 抓取到页面框架内容（导航/Loading），未获得正文，请稍后重试或更换链接');
            break;
          }

          return parsed;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw error;
          }

          lastError = error instanceof Error ? error : new Error(String(error));
          if (attempt < MAX_ATTEMPTS_PER_CANDIDATE) {
            await waitWithAbort(resolveBackoffMs(attempt), controller.signal);
            continue;
          }
          break;
        }
      }

      if (!hasNextCandidate && lastError) {
        throw lastError;
      }
    }

    throw lastError ?? new Error('Jina Reader 抓取失败');
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
