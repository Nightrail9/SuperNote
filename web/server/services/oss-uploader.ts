/**
 * OSS Uploader Service
 *
 * Uploads files to Aliyun OSS with public-read access.
 * Returns the public URL of the uploaded file.
 *
 * Requirements: 3.1, 3.2, 3.3
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';

/**
 * OSS Uploader configuration
 */
export interface OSSUploaderConfig {
  /** OSS region (e.g., oss-cn-hangzhou) */
  region: string;
  /** Aliyun Access Key ID */
  accessKeyId: string;
  /** Aliyun Access Key Secret */
  accessKeySecret: string;
  /** OSS bucket name */
  bucket: string;
}

/**
 * OSS Uploader interface
 */
export interface OSSUploader {
  upload(localPath: string, ossKey: string): Promise<string>;
}

/**
 * Generate the public URL for an OSS object
 *
 * URL pattern: https://{bucket}.{region}.aliyuncs.com/{key}
 *
 * @param bucket - OSS bucket name
 * @param region - OSS region
 * @param key - Object key
 * @returns Public URL
 *
 * Requirements: 3.3
 */
export function generateOSSUrl(
  bucket: string,
  region: string,
  key: string
): string {
  // Ensure key doesn't start with /
  const normalizedKey = key.startsWith('/') ? key.slice(1) : key;
  return `https://${bucket}.${region}.aliyuncs.com/${normalizedKey}`;
}

/**
 * Generate HMAC-SHA1 signature for OSS authentication
 *
 * @param stringToSign - String to sign
 * @param accessKeySecret - Access key secret
 * @returns Base64 encoded signature
 */
function generateSignature(
  stringToSign: string,
  accessKeySecret: string
): string {
  const hmac = crypto.createHmac('sha1', accessKeySecret);
  hmac.update(stringToSign);
  return hmac.digest('base64');
}

/**
 * Get the content type based on file extension
 *
 * @param filePath - File path
 * @returns Content type string
 */
function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.webm': 'video/webm',
    '.m4v': 'video/x-m4v',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Format date for OSS API (RFC 1123 format)
 *
 * @param date - Date to format
 * @returns Formatted date string
 */
function formatDateRFC1123(date: Date): string {
  return date.toUTCString();
}

/**
 * OSS Uploader implementation using Aliyun OSS REST API
 *
 * Requirements: 3.1, 3.2, 3.3
 */
export class OSSUploaderImpl implements OSSUploader {
  private config: OSSUploaderConfig;

  constructor(config: OSSUploaderConfig) {
    this.config = config;
  }

  /**
   * Upload a local file to OSS with public-read access
   *
   * @param localPath - Path to the local file
   * @param ossKey - Object key in OSS (e.g., "bilibili/video.mp4")
   * @returns Public URL of the uploaded file
   * @throws Error if upload fails
   *
   * Requirements: 3.1, 3.2, 3.3
   */
  async upload(localPath: string, ossKey: string): Promise<string> {
    // Validate local file exists
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local file not found: ${localPath}`);
    }

    // Read file content
    const fileContent = fs.readFileSync(localPath);
    const contentType = getContentType(localPath);
    const contentLength = fileContent.length;

    // Normalize ossKey (remove leading slash if present)
    const normalizedKey = ossKey.startsWith('/') ? ossKey.slice(1) : ossKey;

    // Generate date for request
    const date = formatDateRFC1123(new Date());

    // Build the string to sign for OSS authentication
    // Format: VERB + "\n" + Content-MD5 + "\n" + Content-Type + "\n" + Date + "\n" + CanonicalizedOSSHeaders + CanonicalizedResource
    const canonicalizedResource = `/${this.config.bucket}/${normalizedKey}`;

    const stringToSign =
      `PUT\n` +
      `\n` +               // Content-MD5 (empty)
      `${contentType}\n` +
      `${date}\n` +
      `x-oss-acl:public-read\n` +
      canonicalizedResource;

    // Generate signature
    const signature = generateSignature(
      stringToSign,
      this.config.accessKeySecret
    );

    // Build the OSS endpoint URL
    const hostname = `${this.config.bucket}.${this.config.region}.aliyuncs.com`;
    const urlPath = `/${normalizedKey}`;

    // Make the PUT request using https module for full header control
    const responseData = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const req = https.request(
        {
          hostname,
          path: urlPath,
          method: 'PUT',
          headers: {
            'Content-Type': contentType,
            'Content-Length': contentLength,
            'Date': date,
            'x-oss-acl': 'public-read',
            'Authorization': `OSS ${this.config.accessKeyId}:${signature}`,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          res.on('end', () => {
            resolve({ statusCode: res.statusCode || 0, body });
          });
        }
      );
      req.on('error', reject);
      req.write(fileContent);
      req.end();
    });

    if (responseData.statusCode !== 200) {
      throw new Error(
        `OSS upload failed: ${responseData.statusCode} - ${responseData.body}`
      );
    }

    // Return the public URL (Requirement 3.3)
    return generateOSSUrl(this.config.bucket, this.config.region, normalizedKey);
  }
}

/**
 * Create an OSS Uploader instance
 *
 * @param config - OSS configuration
 * @returns OSSUploader instance
 */
export function createOSSUploader(config: OSSUploaderConfig): OSSUploader {
  return new OSSUploaderImpl(config);
}
