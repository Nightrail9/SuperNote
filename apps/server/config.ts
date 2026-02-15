/**
 * Server Configuration Module
 *
 * Loads server configuration from environment variables with sensible defaults.
 *
 * Requirements: 1.6, 5.1, 5.2
 */

/**
 * Server configuration loaded from environment variables
 */
export interface ServerConfig {
  /** Server port number (default: 3000) */
  port: number;
  /** Bilibili SESSDATA cookie for higher quality streams (optional) */
  sessdata?: string;
  /** CORS allowed origin (default: '*') */
  corsOrigin: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Readonly<Omit<ServerConfig, 'sessdata'>> = {
  port: 3001,
  corsOrigin: '*',
};

/**
 * Load server configuration from environment variables
 *
 * Environment variables:
 * - PORT: Server port number (default: 3000)
 * - SESSDATA: Bilibili SESSDATA cookie for higher quality streams
 * - CORS_ORIGIN: CORS allowed origin (default: '*')
 *
 * @returns ServerConfig object with loaded values
 */
export function loadConfig(): ServerConfig {
  const portStr = process.env.PORT;
  let port = DEFAULT_CONFIG.port;

  if (portStr) {
    const parsedPort = parseInt(portStr, 10);
    // Only use parsed port if it's a valid positive number
    if (!isNaN(parsedPort) && parsedPort > 0) {
      port = parsedPort;
    }
  }

  // SESSDATA is optional - only set if non-empty
  const sessdata = process.env.SESSDATA || undefined;

  // CORS_ORIGIN defaults to '*' (allow all origins)
  const corsOrigin = process.env.CORS_ORIGIN || DEFAULT_CONFIG.corsOrigin;

  return {
    port,
    sessdata,
    corsOrigin,
  };
}
