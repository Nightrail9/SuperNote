/**
 * Summarize Route Handler
 *
 * POST /api/summarize endpoint that accepts a Bilibili video URL
 * and AI configuration, then returns a summarized note via the
 * unified Summary Pipeline.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 7.2, 7.3
 */

import { Router } from 'express';

import { BILIBILI_URL_PATTERN } from '../constants/index.js';
import {
  loadSummaryPipelineConfig,
  createSummaryPipeline,
  type SummaryPipeline,
} from '../services/summary-pipeline.js';
import type { Request, Response } from 'express';

/**
 * Request body interface for POST /api/summarize
 *
 * Requirements: 1.1
 */
export interface SummarizeRequest {
  /** Bilibili video URL */
  url: string;
  /** AI API address (HTTPS) */
  apiUrl: string;
  /** AI API key */
  apiKey: string;
  /** Summary prompt */
  prompt: string;
}

/**
 * Success response interface for POST /api/summarize
 *
 * Requirements: 1.1
 */
export interface SummarizeSuccessResponse {
  success: true;
  data: {
    /** Video title */
    title: string;
    /** AI-generated summary */
    summary: string;
    /** Raw Markdown content */
    markdown: string;
  };
}

/**
 * Error response interface for POST /api/summarize
 *
 * Requirements: 7.1, 7.2, 7.3
 */
export interface SummarizeErrorResponse {
  success: false;
  error: {
    /** Error stage: validate | parse | download | extract_frames | local_transcribe | generate | ai_call | server */
    stage: string;
    /** Error code for client-side handling */
    code: string;
    /** Human-readable error message */
    message: string;
  };
}

/**
 * Combined response type for POST /api/summarize
 */
export type SummarizeResponse = SummarizeSuccessResponse | SummarizeErrorResponse;

/**
 * Bilibili URL validation pattern.
 *
 * Matches:
 * - bilibili.com/video/BVxxx
 * - bilibili.com/video/avxxx
 * - b23.tv/xxx
 * - m.bilibili.com/video/BVxxx
 *
 * Requirements: 1.3, 2.3
 */

/**
 * Validate the summarize request body.
 *
 * Validation order:
 * 1. url — required, must match Bilibili video URL format
 * 2. apiUrl, apiKey, prompt — required, apiUrl must use HTTPS
 *
 * @param body - Request body to validate
 * @returns null if valid, or a SummarizeErrorResponse if invalid
 *
 * Requirements: 1.2, 1.3, 1.4, 1.5
 */
export function validateSummarizeRequest(body: any): SummarizeErrorResponse | null {
  // ── Check url field ─────────────────────────────────────────────────
  // Requirement 1.2: Missing or empty url → MISSING_URL
  if (!body.url || typeof body.url !== 'string' || body.url.trim().length === 0) {
    return {
      success: false,
      error: {
        stage: 'validate',
        code: 'MISSING_URL',
        message: 'Request body must contain a non-empty "url" field',
      },
    };
  }

  // Requirement 1.3: Non-Bilibili URL → INVALID_URL
  if (!BILIBILI_URL_PATTERN.test(body.url.trim())) {
    return {
      success: false,
      error: {
        stage: 'validate',
        code: 'INVALID_URL',
        message: 'URL must be a valid Bilibili video link (bilibili.com/video/BVxxx, bilibili.com/video/avxxx, or b23.tv/xxx)',
      },
    };
  }

  // ── Check AI config fields ──────────────────────────────────────────
  // Requirement 1.4: Missing AI config → MISSING_AI_CONFIG
  const missingAiFields: string[] = [];
  if (!body.apiUrl || typeof body.apiUrl !== 'string' || body.apiUrl.trim().length === 0) {
    missingAiFields.push('apiUrl');
  }
  if (!body.apiKey || typeof body.apiKey !== 'string' || body.apiKey.trim().length === 0) {
    missingAiFields.push('apiKey');
  }
  if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
    missingAiFields.push('prompt');
  }

  if (missingAiFields.length > 0) {
    return {
      success: false,
      error: {
        stage: 'validate',
        code: 'MISSING_AI_CONFIG',
        message: `Missing required AI configuration fields: ${missingAiFields.join(', ')}`,
      },
    };
  }

  // Requirement 1.5: Non-HTTPS apiUrl → INVALID_API_URL
  try {
    const parsedUrl = new URL(body.apiUrl);
    if (parsedUrl.protocol !== 'https:') {
      return {
        success: false,
        error: {
          stage: 'validate',
          code: 'INVALID_API_URL',
          message: 'API URL must use HTTPS protocol',
        },
      };
    }
  } catch {
    return {
      success: false,
      error: {
        stage: 'validate',
        code: 'INVALID_API_URL',
        message: 'API URL format is invalid',
      },
    };
  }

  return null;
}

/**
 * Create the summarize router.
 *
 * @returns Express Router with /api/summarize endpoint
 */
export function createSummarizeRouter(): Router {
  const router = Router();

  /**
   * POST /api/summarize
   *
   * Accepts a Bilibili video URL and AI configuration, then executes
   * the full Summary Pipeline (parse → download → local_transcribe →
   * generate Markdown → AI summarize) and returns the result.
   *
   * Request body:
   * - url: string — Bilibili video URL
   * - apiUrl: string — AI API URL (HTTPS)
   * - apiKey: string — AI API key
   * - prompt: string — Summary prompt
   *
   * Response:
   * - success: boolean
   * - data?: { title, summary, markdown } (on success)
   * - error?: { stage, code, message } (on failure)
   *
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 7.2, 7.3
   */
  router.post('/summarize', async (req: Request, res: Response) => {
    try {
      // ── Validate request ──────────────────────────────────────────
      const validationError = validateSummarizeRequest(req.body);
      if (validationError) {
        res.status(400).json(validationError);
        return;
      }

      const { url, apiUrl, apiKey, prompt } = req.body as SummarizeRequest;

      // ── Load pipeline config from environment ─────────────────────
      let pipeline: SummaryPipeline;
      try {
        const config = loadSummaryPipelineConfig();
        pipeline = createSummaryPipeline(config);
      } catch (error) {
        const errorResponse: SummarizeErrorResponse = {
          success: false,
          error: {
            stage: 'server',
            code: 'CONFIG_ERROR',
            message: error instanceof Error ? error.message : 'Failed to load pipeline configuration',
          },
        };
        res.status(500).json(errorResponse);
        return;
      }

      // ── Execute pipeline ──────────────────────────────────────────
      const result = await pipeline.execute(url, { apiUrl, apiKey, prompt });

      if (result.success) {
        const successResponse: SummarizeSuccessResponse = {
          success: true,
          data: {
            title: result.title ?? '',
            summary: result.summary ?? '',
            markdown: result.markdown ?? '',
          },
        };
        res.json(successResponse);
      } else {
        // Pipeline returned a structured error — forward it
        const errorResponse: SummarizeErrorResponse = {
          success: false,
          error: {
            stage: result.error?.stage ?? 'server',
            code: result.error?.code ?? 'UNKNOWN',
            message: result.error?.message ?? 'Unknown pipeline error',
          },
        };
        // Use 500 for server-stage errors, 502 for external service errors
        const statusCode = result.error?.stage === 'validate' ? 400 : 500;
        res.status(statusCode).json(errorResponse);
      }
    } catch (error) {
      // ── Unexpected server error ─────────────────────────────────
      // Requirement 7.3: Return 500 with INTERNAL_ERROR
      const errorResponse: SummarizeErrorResponse = {
        success: false,
        error: {
          stage: 'server',
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Internal server error',
        },
      };
      res.status(500).json(errorResponse);
    }
  });

  return router;
}
