/**
 * Configuration Manager for Bilibili Video Parser
 *
 * Manages parser configuration including authentication and request settings.
 * Implements Requirements: 7.1, 7.2, 7.3, 7.4
 */

import type { Config} from './types.js';
import { DEFAULT_CONFIG } from './types.js';

/**
 * ConfigManager interface
 */
export interface ConfigManager {
  load(): Config;
  fromEnv(): Config;
}

/**
 * Environment variable names for configuration
 */
const ENV_VARS = {
  SESSDATA: ['SESSDATA', 'BILIBILI_SESSDATA'],
  USER_AGENT: ['BILIBILI_USER_AGENT', 'USER_AGENT'],
  REFERER: ['BILIBILI_REFERER'],
  TIMEOUT: ['BILIBILI_TIMEOUT'],
  RETRY_ATTEMPTS: ['BILIBILI_RETRY_ATTEMPTS'],
} as const;

/**
 * Get the first defined environment variable from a list of names
 * @param names - Array of environment variable names to check
 * @returns The value of the first defined environment variable, or undefined
 */
function getEnvValue(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== '') {
      return value;
    }
  }
  return undefined;
}

/**
 * Parse an integer from environment variable with fallback
 * @param names - Array of environment variable names to check
 * @param defaultValue - Default value if not set or invalid
 * @returns Parsed integer or default value
 */
function getEnvInt(names: readonly string[], defaultValue: number): number {
  const value = getEnvValue(names);
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed <= 0 ? defaultValue : parsed;
}

/**
 * Load configuration from environment variables
 *
 * Supports the following environment variables:
 * - SESSDATA or BILIBILI_SESSDATA: Authentication cookie (Requirement 7.1)
 * - BILIBILI_USER_AGENT or USER_AGENT: Custom User-Agent (Requirement 7.2)
 * - BILIBILI_REFERER: Custom Referer header
 * - BILIBILI_TIMEOUT: Request timeout in milliseconds (Requirement 7.3)
 * - BILIBILI_RETRY_ATTEMPTS: Number of retry attempts (Requirement 7.4)
 *
 * @returns Config object with values from environment or defaults
 */
export function fromEnv(): Config {
  // Requirement 7.1: Load SESSDATA from environment variable
  const sessdata = getEnvValue(ENV_VARS.SESSDATA);

  // Requirement 7.2: Use default User-Agent when not configured
  const userAgent = getEnvValue(ENV_VARS.USER_AGENT) ?? DEFAULT_CONFIG.userAgent;

  // Referer configuration
  const referer = getEnvValue(ENV_VARS.REFERER) ?? DEFAULT_CONFIG.referer;

  // Requirement 7.3: Configurable timeout values
  const timeout = getEnvInt(ENV_VARS.TIMEOUT, DEFAULT_CONFIG.timeout);

  // Requirement 7.4: Configurable retry attempts
  const retryAttempts = getEnvInt(ENV_VARS.RETRY_ATTEMPTS, DEFAULT_CONFIG.retryAttempts);

  return {
    sessdata,
    userAgent,
    referer,
    timeout,
    retryAttempts,
  };
}

/**
 * Load configuration with optional overrides
 *
 * Merges environment configuration with provided overrides.
 * Override values take precedence over environment values.
 *
 * @param overrides - Optional partial config to override environment values
 * @returns Complete Config object
 */
export function load(overrides?: Partial<Config>): Config {
  const envConfig = fromEnv();

  if (!overrides) {
    return envConfig;
  }

  return {
    sessdata: overrides.sessdata ?? envConfig.sessdata,
    userAgent: overrides.userAgent ?? envConfig.userAgent,
    referer: overrides.referer ?? envConfig.referer,
    timeout: overrides.timeout ?? envConfig.timeout,
    retryAttempts: overrides.retryAttempts ?? envConfig.retryAttempts,
  };
}

/**
 * Create a ConfigManager instance
 * @returns ConfigManager implementation
 */
export function createConfigManager(): ConfigManager {
  return {
    load: () => load(),
    fromEnv,
  };
}

/**
 * Get the default configuration
 * @returns Default Config object
 */
export function getDefaultConfig(): Config {
  return { ...DEFAULT_CONFIG };
}

// Export default config manager instance
export const configManager = createConfigManager();
