/**
 * Parse Route Handler
 * 
 * POST /api/parse endpoint that accepts a Bilibili video URL
 * and returns parsed video data with stream information.
 * 
 * Requirements: 1.1, 1.2, 1.4
 */

import { Router, Request, Response } from 'express';
import { parse } from '../../../packages/parser-core/src/parser.js';
import { ParseResult, StreamOption } from '../../../packages/parser-core/src/types.js';
import { loadConfig } from '../config.js';

/**
 * Request body interface for /api/parse endpoint
 */
export interface ParseRequest {
  url: string;
}

/**
 * Success response interface
 */
export interface ParseSuccessResponse {
  success: true;
  data: {
    title: string;
    bvid: string;
    aid: number;
    cid: number;
    part: number;
    duration: number;
    streams: StreamOption[];
  };
}

/**
 * Error response interface
 */
export interface ParseErrorResponse {
  success: false;
  error: {
    stage: string;
    code: string;
    message: string;
  };
}

/**
 * Combined response type
 */
export type ParseResponse = ParseSuccessResponse | ParseErrorResponse;

/**
 * Create the parse router
 * 
 * @returns Express Router with /api/parse endpoint
 */
export function createParseRouter(): Router {
  const router = Router();

  /**
   * POST /api/parse
   * 
   * Accepts a Bilibili video URL and returns parsed video data.
   * 
   * Request body:
   * - url: string - The Bilibili video URL to parse
   * 
   * Response:
   * - success: boolean - Whether parsing succeeded
   * - data?: ParsedVideoData - Video metadata and streams (on success)
   * - error?: ErrorInfo - Error details (on failure)
   */
  router.post('/parse', async (req: Request, res: Response) => {
    try {
      const { url } = req.body as ParseRequest;

      // Validate request body contains url field
      if (!url || typeof url !== 'string') {
        const errorResponse: ParseErrorResponse = {
          success: false,
          error: {
            stage: 'server',
            code: 'MISSING_URL',
            message: 'Request body must contain a "url" field',
          },
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Load server config to get SESSDATA
      const serverConfig = loadConfig();

      // Call Parser_Core's parse() function
      // Requirement 1.1: API_Server SHALL 调用 Parser_Core 执行完整解析流程
      const result: ParseResult = await parse(url, {
        sessdata: serverConfig.sessdata,
      });

      if (result.success && result.data) {
        // Requirement 1.2: 返回包含视频元数据和流地址的 JSON 响应
        const successResponse: ParseSuccessResponse = {
          success: true,
          data: {
            title: result.data.title,
            bvid: result.data.bvid,
            aid: result.data.aid,
            cid: result.data.cid,
            part: result.data.part,
            duration: result.data.duration,
            streams: result.data.streams,
          },
        };
        res.json(successResponse);
      } else {
        // Return parse error from Parser_Core
        const errorResponse: ParseErrorResponse = {
          success: false,
          error: {
            stage: result.error?.stage ?? 'unknown',
            code: result.error?.code ?? 'UNKNOWN',
            message: result.error?.message ?? 'Unknown error occurred',
          },
        };
        res.json(errorResponse);
      }
    } catch (error) {
      // Handle unexpected server errors
      const errorResponse: ParseErrorResponse = {
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

