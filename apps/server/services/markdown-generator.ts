/**
 * Markdown 生成服务
 *
 * 负责拉取 PPT 提取结果并格式化为 Markdown 文本。
 */

/** PPT 页信息 */
export interface PPTFrame {
  /** PPT 图片地址 */
  fileUrl: string;
  /** 该页摘要 */
  summary: string;
}

/** PPT 提取结果 */
export interface PPTData {
  /** 页列表 */
  keyFrameList: PPTFrame[];
  /** 完整 PDF 地址（可选） */
  pdfPath?: string;
}

/** Markdown 生成器接口 */
export interface MarkdownGenerator {
  fetchPPTData(pptUrl: string): Promise<PPTData>;
  formatMarkdown(title: string, pptData: PPTData): string;
}

/** 默认重试配置 */
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_DELAY_MS = 1000;

/** 可注入的 fetch 类型 */
export type FetchFunction = (
  url: string,
  options?: RequestInit
) => Promise<Response>;

/** Markdown 生成器实现 */
export class MarkdownGeneratorImpl implements MarkdownGenerator {
  private fetchFn: FetchFunction;
  private maxRetries: number;
  private retryDelayMs: number;

  /** 创建实例 */
  constructor(options?: {
    fetchFn?: FetchFunction;
    maxRetries?: number;
    retryDelayMs?: number;
  }) {
    this.fetchFn = options?.fetchFn ?? fetch;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  /** 拉取 PPT 提取结果 */
  async fetchPPTData(pptUrl: string): Promise<PPTData> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // 指数退避：1s、2s、4s
          await this.sleep(this.retryDelayMs * Math.pow(2, attempt - 1));
        }

        const response = await this.fetchFn(pptUrl);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch PPT data: HTTP ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        return this.parsePPTData(data);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 仅在网络类错误或 429 时重试
        if (
          error instanceof Error &&
          !this.isRetryableError(error) &&
          attempt === 0
        ) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error('Failed to fetch PPT data after retries');
  }

  /** 将 PPT 数据格式化为 Markdown */
  formatMarkdown(title: string, pptData: PPTData): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# ${title}`);
    lines.push('');

    // PPT 页内容
    if (pptData.keyFrameList && pptData.keyFrameList.length > 0) {
      lines.push('## PPT 内容');
      lines.push('');

      pptData.keyFrameList.forEach((frame, index) => {
        // 图片
        lines.push(`### 第 ${index + 1} 页`);
        lines.push('');
        lines.push(`![PPT 第 ${index + 1} 页](${frame.fileUrl})`);
        lines.push('');

        // 摘要
        if (frame.summary && frame.summary.trim()) {
          lines.push(`**摘要:** ${frame.summary}`);
          lines.push('');
        }
      });
    }

    // 完整 PDF 链接
    if (pptData.pdfPath) {
      lines.push('## 完整 PDF');
      lines.push('');
      lines.push(`[下载完整 PDF](${pptData.pdfPath})`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /** 解析原始 PPT 数据 */
  private parsePPTData(data: unknown): PPTData {
    // 兼容不同返回结构
    const rawData = data as Record<string, unknown>;

    // 提取 keyFrameList
    let keyFrameList: PPTFrame[] = [];
    let pdfPath: string | undefined;

    // PptExtraction.KeyFrameList（大写字段）
    if (
      rawData.PptExtraction &&
      typeof rawData.PptExtraction === 'object' &&
      Array.isArray((rawData.PptExtraction as Record<string, unknown>).KeyFrameList)
    ) {
      keyFrameList = this.parseKeyFrameList(
        (rawData.PptExtraction as Record<string, unknown>).KeyFrameList as unknown[],
        true // 使用大写字段名
      );
      const pptExtraction = rawData.PptExtraction as Record<string, unknown>;
      if (typeof pptExtraction.PdfPath === 'string' && pptExtraction.PdfPath) {
        pdfPath = pptExtraction.PdfPath;
      }
    }
    // keyFrameList（小写字段）
    else if (Array.isArray(rawData.keyFrameList)) {
      keyFrameList = this.parseKeyFrameList(rawData.keyFrameList, false);
    } else if (
      rawData.data &&
      typeof rawData.data === 'object' &&
      Array.isArray((rawData.data as Record<string, unknown>).keyFrameList)
    ) {
      keyFrameList = this.parseKeyFrameList(
        (rawData.data as Record<string, unknown>).keyFrameList as unknown[],
        false
      );
    }

    // 提取 pdfPath
    if (!pdfPath) {
      if (typeof rawData.pdfPath === 'string' && rawData.pdfPath) {
        pdfPath = rawData.pdfPath;
      } else if (
        rawData.data &&
        typeof rawData.data === 'object' &&
        typeof (rawData.data as Record<string, unknown>).pdfPath === 'string'
      ) {
        pdfPath = (rawData.data as Record<string, unknown>).pdfPath as string;
      }
    }

    return {
      keyFrameList,
      pdfPath,
    };
  }

  /** 解析关键帧列表 */
  private parseKeyFrameList(rawList: unknown[], uppercase: boolean): PPTFrame[] {
    return rawList
      .filter((item): item is Record<string, unknown> => {
        return item !== null && typeof item === 'object';
      })
      .map((item) => {
        const fileUrlKey = uppercase ? 'FileUrl' : 'fileUrl';
        const summaryKey = uppercase ? 'Summary' : 'summary';
        return {
          fileUrl: typeof item[fileUrlKey] === 'string' ? item[fileUrlKey] as string : '',
          summary: typeof item[summaryKey] === 'string' ? item[summaryKey] as string : '',
        };
      })
      .filter((frame) => frame.fileUrl); // 仅保留有效图片地址
  }

  /** 判断是否可重试 */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('429') ||
      message.includes('rate')
    );
  }

  /** 休眠指定毫秒 */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** 创建 Markdown 生成器 */
export function createMarkdownGenerator(options?: {
  fetchFn?: FetchFunction;
  maxRetries?: number;
  retryDelayMs?: number;
}): MarkdownGenerator {
  return new MarkdownGeneratorImpl(options);
}
