/**
 * Video Processor Configuration Loader
 *
 * Loads video processor configuration from environment variables.
 * Provides validation to ensure all required configuration is present.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

/**
 * Video processor configuration loaded from environment variables
 */
export interface VideoProcessorEnvConfig {
  /** Tingwu App Key for AI transcription */
  tingwuAppKey: string;
  /** Aliyun Access Key ID for OSS and Tingwu */
  aliyunAccessKeyId: string;
  /** Aliyun Access Key Secret for OSS and Tingwu */
  aliyunAccessKeySecret: string;
  /** OSS region (default: oss-cn-hangzhou) */
  ossRegion: string;
  /** OSS bucket name */
  ossBucket: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_OSS_REGION = 'oss-cn-hangzhou';

/**
 * Load video processor configuration from environment variables
 *
 * Environment variables:
 * - TINGWU_APP_KEY: Tingwu App Key for AI transcription (required)
 * - ALIYUN_ACCESS_KEY_ID: Aliyun Access Key ID (required)
 * - ALIYUN_ACCESS_KEY_SECRET: Aliyun Access Key Secret (required)
 * - OSS_REGION: OSS region (default: oss-cn-hangzhou)
 * - OSS_BUCKET: OSS bucket name (required)
 *
 * @returns VideoProcessorEnvConfig object with loaded values
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
export function loadVideoProcessorConfig(): VideoProcessorEnvConfig {
  const tingwuAppKey = process.env.TINGWU_APP_KEY || '';
  const aliyunAccessKeyId = process.env.ALIYUN_ACCESS_KEY_ID || '';
  const aliyunAccessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET || '';
  const ossRegion = process.env.OSS_REGION || DEFAULT_OSS_REGION;
  const ossBucket = process.env.OSS_BUCKET || '';

  return {
    tingwuAppKey,
    aliyunAccessKeyId,
    aliyunAccessKeySecret,
    ossRegion,
    ossBucket,
  };
}

/**
 * Validate video processor configuration
 *
 * Throws an error if any required configuration is missing.
 *
 * @param config - Partial configuration to validate
 * @throws Error if required configuration is missing
 *
 * Requirements: 9.6
 */
export function validateConfig(config: Partial<VideoProcessorEnvConfig>): void {
  const missingFields: string[] = [];

  if (!config.tingwuAppKey) {
    missingFields.push('TINGWU_APP_KEY');
  }

  if (!config.aliyunAccessKeyId) {
    missingFields.push('ALIYUN_ACCESS_KEY_ID');
  }

  if (!config.aliyunAccessKeySecret) {
    missingFields.push('ALIYUN_ACCESS_KEY_SECRET');
  }

  if (!config.ossBucket) {
    missingFields.push('OSS_BUCKET');
  }

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingFields.join(', ')}`
    );
  }
}

