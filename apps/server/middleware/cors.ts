/**
 * CORS Middleware
 * 
 * Sets appropriate CORS response headers to allow frontend cross-origin access.
 * Handles preflight OPTIONS requests.
 * 
 * Requirements: 1.5
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * CORS configuration options
 */
export interface CorsConfig {
  origin: string | string[];  // Allowed origins
  methods: string[];          // Allowed HTTP methods
  allowedHeaders: string[];   // Allowed request headers
}

/**
 * Default CORS configuration
 */
const DEFAULT_CORS_CONFIG: CorsConfig = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

/**
 * Determines the Access-Control-Allow-Origin header value based on config and request
 * 
 * @param config - CORS configuration
 * @param requestOrigin - Origin header from the request
 * @returns The origin value to set in the response header
 */
function resolveOrigin(config: CorsConfig, requestOrigin?: string): string {
  const { origin } = config;

  // If origin is '*', allow all
  if (origin === '*') {
    return '*';
  }

  // If origin is a string, use it directly
  if (typeof origin === 'string') {
    return origin;
  }

  // If origin is an array, check if request origin is in the list
  if (Array.isArray(origin) && requestOrigin && origin.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Default to first origin in array or empty string
  return Array.isArray(origin) && origin.length > 0 ? origin[0] : '';
}

/**
 * Creates a CORS middleware function
 * 
 * @param config - Optional CORS configuration (uses defaults if not provided)
 * @returns Express middleware function that sets CORS headers
 */
export function createCorsMiddleware(config?: Partial<CorsConfig>): RequestHandler {
  const mergedConfig: CorsConfig = {
    ...DEFAULT_CORS_CONFIG,
    ...config,
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestOrigin = req.headers.origin;
    const allowedOrigin = resolveOrigin(mergedConfig, requestOrigin);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', mergedConfig.methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', mergedConfig.allowedHeaders.join(', '));

    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

