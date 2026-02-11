/**
 * Tingwu Client Service
 *
 * Client for Aliyun Tingwu (通义听悟) AI transcription service.
 * Creates transcription tasks with PPT extraction enabled and polls for completion.
 *
 * Requirements: 4.1, 4.2, 4.3
 */

import * as tingwu from '@alicloud/tingwu20230930';
import * as $OpenApi from '@alicloud/openapi-client';

// @ts-ignore - Handle default export variations
const TingwuSDKClient = tingwu.default?.default || tingwu.default || tingwu;

/**
 * Tingwu client configuration
 */
export interface TingwuConfig {
  /** Tingwu App Key */
  appKey: string;
  /** Tingwu endpoint (optional) */
  endpoint?: string;
  /** Aliyun Access Key ID */
  accessKeyId: string;
  /** Aliyun Access Key Secret */
  accessKeySecret: string;
}

/**
 * Transcription result containing task ID and result URLs
 */
export interface TranscriptionResult {
  /** Tingwu task ID */
  taskId: string;
  /** URL to the transcription result JSON */
  transcriptionUrl?: string;
  /** URL to the PPT extraction result JSON */
  pptExtractionUrl?: string;
}

/**
 * Tingwu task status
 */
export type TingwuTaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

/**
 * Tingwu client interface
 */
export interface TingwuClient {
  createTask(videoUrl: string): Promise<string>;
  waitForCompletion(taskId: string): Promise<TranscriptionResult>;
}

/**
 * Default polling interval in milliseconds (10 seconds)
 */
export const DEFAULT_POLL_INTERVAL_MS = 10000;

/**
 * Default maximum polling attempts (30 minutes / 10 seconds = 180 attempts)
 */
export const DEFAULT_MAX_POLL_ATTEMPTS = 180;

/**
 * Tingwu API endpoint
 */
export const TINGWU_ENDPOINT = 'tingwu.cn-beijing.aliyuncs.com';

const LEGACY_OR_INVALID_ENDPOINTS = new Set([
  'dashscope.aliyuncs.com',
  'www.dashscope.aliyuncs.com',
  'https',
  'http',
]);

export function normalizeTingwuEndpoint(endpoint?: string): string {
  const raw = endpoint?.trim();
  if (!raw) {
    return TINGWU_ENDPOINT;
  }

  let normalized = raw;

  // Repair malformed nested scheme: https://https//host -> https://host
  normalized = normalized.replace(/^(https?:\/\/)(https?:\/\/)/i, '$2');
  normalized = normalized.replace(/^(https?:\/\/)(https?:\/\/)?(https?)\/\//i, '$1');

  // Repair malformed scheme like "https//host" -> "https://host"
  normalized = normalized.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*)\/\//, '$1://');

  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalized)) {
      const parsed = new URL(normalized);
      if ((parsed.hostname === 'https' || parsed.hostname === 'http') && parsed.pathname.startsWith('//')) {
        normalized = `${parsed.protocol}${parsed.pathname}`;
      } else {
        normalized = parsed.hostname;
      }
    } else {
      normalized = normalized.split('/')[0] ?? normalized;
      normalized = normalized.split('?')[0] ?? normalized;
      normalized = normalized.split('#')[0] ?? normalized;
    }
  } catch {
    normalized = normalized.split('/')[0] ?? normalized;
  }

  normalized = normalized.trim().toLowerCase();
  if (!normalized) {
    return TINGWU_ENDPOINT;
  }

  if (LEGACY_OR_INVALID_ENDPOINTS.has(normalized)) {
    return TINGWU_ENDPOINT;
  }

  return normalized;
}

/**
 * Create a Tingwu SDK client instance
 *
 * @param config - Tingwu configuration
 * @returns Tingwu SDK client
 */
export function createTingwuSDKClient(config: TingwuConfig): any {
  const endpoint = normalizeTingwuEndpoint(config.endpoint);
  const openApiConfig = new $OpenApi.Config({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    endpoint,
  });
  return new TingwuSDKClient(openApiConfig);
}

/**
 * Generate a unique task key for Tingwu
 *
 * @returns Task key string
 */
export function generateTaskKey(): string {
  return `bili_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Tingwu Client implementation
 *
 * Requirements: 4.1, 4.2, 4.3
 */
export class TingwuClientImpl implements TingwuClient {
  private config: TingwuConfig;
  private client: any;
  private pollIntervalMs: number;
  private maxPollAttempts: number;

  /**
   * Create a new TingwuClient instance
   *
   * @param config - Tingwu configuration
   * @param options - Optional settings for polling behavior
   */
  constructor(
    config: TingwuConfig,
    options?: {
      pollIntervalMs?: number;
      maxPollAttempts?: number;
      client?: any; // Allow injecting client for testing
    }
  ) {
    this.config = config;
    this.pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxPollAttempts = options?.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
    this.client = options?.client ?? createTingwuSDKClient(config);
  }

  /**
   * Create a transcription task with PPT extraction enabled
   *
   * @param videoUrl - URL of the video to transcribe (must be publicly accessible)
   * @returns Task ID
   * @throws Error if task creation fails
   *
   * Requirements: 4.1
   */
  async createTask(videoUrl: string): Promise<string> {
    const taskKey = generateTaskKey();

    // Create the request with PPT extraction enabled (Requirement 4.1)
    const request = new tingwu.CreateTaskRequest({
      type: 'offline',
      input: new tingwu.CreateTaskRequestInput({
        sourceLanguage: 'cn',
        taskKey: taskKey,
        fileUrl: videoUrl,
      }),
      parameters: new tingwu.CreateTaskRequestParameters({
        transcription: new tingwu.CreateTaskRequestParametersTranscription({
          diarizationEnabled: false,
        }),
        pptExtractionEnabled: true, // Enable PPT extraction (Requirement 4.1)
      }),
    });

    // Set the app key on the request
    // @ts-ignore - appKey is set dynamically
    request.appKey = this.config.appKey;

    const response = await this.client.createTask(request);

    // Check for errors
    if (response.body?.code !== '0') {
      const errorMessage = response.body?.message || 'Unknown error';
      throw new Error(`Failed to create Tingwu task: ${errorMessage}`);
    }

    const taskId = response.body?.data?.taskId;
    if (!taskId) {
      throw new Error('Failed to create Tingwu task: No task ID returned');
    }

    return taskId;
  }

  /**
   * Wait for a transcription task to complete by polling
   *
   * @param taskId - Task ID to poll
   * @returns Transcription result with URLs
   * @throws Error if task fails or times out
   *
   * Requirements: 4.2, 4.3
   */
  async waitForCompletion(taskId: string): Promise<TranscriptionResult> {
    let attempts = 0;

    // Poll until completion or failure (Requirement 4.2)
    while (attempts < this.maxPollAttempts) {
      // Wait before polling (except on first attempt for immediate check)
      if (attempts > 0) {
        await this.sleep(this.pollIntervalMs);
      }

      attempts++;

      const response = await this.client.getTaskInfo(taskId);
      const status = response.body?.data?.taskStatus as TingwuTaskStatus;

      if (status === 'COMPLETED') {
        // Return the result URLs (Requirement 4.3)
        const result = response.body?.data?.result;
        return {
          taskId,
          transcriptionUrl: result?.transcription,
          pptExtractionUrl: result?.pptExtraction,
        };
      }

      if (status === 'FAILED') {
        const errorMessage =
          response.body?.data?.errorMessage || 'Transcription failed';
        throw new Error(`Tingwu task failed: ${errorMessage}`);
      }

      // Continue polling for PENDING or RUNNING status
    }

    // Timeout after max attempts
    throw new Error(
      `Tingwu task timed out after ${this.maxPollAttempts} polling attempts`
    );
  }

  /**
   * Sleep for a specified duration
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a TingwuClient instance
 *
 * @param config - Tingwu configuration
 * @param options - Optional settings for polling behavior
 * @returns TingwuClient instance
 */
export function createTingwuClient(
  config: TingwuConfig,
  options?: {
    pollIntervalMs?: number;
    maxPollAttempts?: number;
    client?: any;
  }
): TingwuClient {
  return new TingwuClientImpl(config, options);
}
