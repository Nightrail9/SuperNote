/**
 * JSON Serialization/Deserialization for ParseResult
 *
 * Implements Requirements: 6.4, 6.5
 * - 6.4: THE Parser SHALL serialize the complete result to JSON format
 * - 6.5: THE Parser SHALL deserialize JSON input back to structured objects (round-trip property)
 *
 * Property 10: JSON Serialization Round-Trip
 * For any valid ParseResult object, serializing to JSON and then deserializing
 * should produce an equivalent object.
 */

import type {
  ParseResult,
  ParsedVideo,
  ParseError,
  StreamOption,
} from './types.js';

/**
 * Serializer interface for JSON conversion
 */
export interface Serializer {
  toJSON(result: ParseResult): string;
  fromJSON(json: string): ParseResult;
}

/**
 * Error thrown when JSON deserialization fails
 */
export class SerializerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SerializerError';
  }
}

/**
 * Validates that a value is a valid ParseError
 */
function isValidParseError(value: unknown): value is ParseError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields
  if (typeof obj.stage !== 'string') {
    return false;
  }

  // Validate stage is one of the allowed values
  const validStages = ['normalize', 'extract', 'metadata', 'playurl', 'synthesize'];
  if (!validStages.includes(obj.stage)) {
    return false;
  }

  if (typeof obj.code !== 'string') {
    return false;
  }

  if (typeof obj.message !== 'string') {
    return false;
  }

  return true;
}

/**
 * Validates that a value is a valid StreamOption
 */
function isValidStreamOption(value: unknown): value is StreamOption {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields
  if (typeof obj.quality !== 'number') {
    return false;
  }

  if (typeof obj.qualityDescription !== 'string') {
    return false;
  }

  if (typeof obj.format !== 'string') {
    return false;
  }

  // Validate format is one of the allowed values
  const validFormats = ['dash', 'flv', 'mp4'];
  if (!validFormats.includes(obj.format)) {
    return false;
  }

  // Validate optional video field
  if (obj.video !== undefined) {
    if (typeof obj.video !== 'object' || obj.video === null) {
      return false;
    }
    const video = obj.video as Record<string, unknown>;
    if (
      typeof video.url !== 'string' ||
      !Array.isArray(video.backupUrls) ||
      typeof video.codecs !== 'string' ||
      typeof video.width !== 'number' ||
      typeof video.height !== 'number' ||
      typeof video.bandwidth !== 'number'
    ) {
      return false;
    }
  }

  // Validate optional audio field
  if (obj.audio !== undefined) {
    if (typeof obj.audio !== 'object' || obj.audio === null) {
      return false;
    }
    const audio = obj.audio as Record<string, unknown>;
    if (
      typeof audio.url !== 'string' ||
      !Array.isArray(audio.backupUrls) ||
      typeof audio.codecs !== 'string' ||
      typeof audio.bandwidth !== 'number'
    ) {
      return false;
    }
  }

  // Validate optional url field (for FLV/MP4)
  if (obj.url !== undefined && typeof obj.url !== 'string') {
    return false;
  }

  return true;
}

/**
 * Validates that a value is a valid ParsedVideo
 */
function isValidParsedVideo(value: unknown): value is ParsedVideo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields
  if (typeof obj.title !== 'string') {
    return false;
  }

  if (typeof obj.bvid !== 'string') {
    return false;
  }

  if (typeof obj.aid !== 'number') {
    return false;
  }

  if (typeof obj.cid !== 'number') {
    return false;
  }

  if (typeof obj.part !== 'number') {
    return false;
  }

  if (typeof obj.duration !== 'number') {
    return false;
  }

  if (!Array.isArray(obj.streams)) {
    return false;
  }

  // Validate each stream option
  for (const stream of obj.streams) {
    if (!isValidStreamOption(stream)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates that a value is a valid ParseResult
 */
function isValidParseResult(value: unknown): value is ParseResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check success field
  if (typeof obj.success !== 'boolean') {
    return false;
  }

  // If success is true, data should be present and valid
  if (obj.success === true) {
    if (obj.data === undefined) {
      return false;
    }
    if (!isValidParsedVideo(obj.data)) {
      return false;
    }
  }

  // If success is false, error should be present and valid
  if (obj.success === false) {
    if (obj.error === undefined) {
      return false;
    }
    if (!isValidParseError(obj.error)) {
      return false;
    }
  }

  return true;
}

/**
 * Serialize a ParseResult to JSON string
 *
 * @param result - The ParseResult to serialize
 * @returns JSON string representation
 */
export function toJSON(result: ParseResult): string {
  return JSON.stringify(result);
}

/**
 * Deserialize a JSON string to ParseResult
 *
 * @param json - The JSON string to deserialize
 * @returns ParseResult object
 * @throws SerializerError if the JSON is invalid or doesn't match ParseResult structure
 */
export function fromJSON(json: string): ParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new SerializerError(`Invalid JSON: ${(e as Error).message}`);
  }

  if (!isValidParseResult(parsed)) {
    throw new SerializerError('JSON does not match ParseResult structure');
  }

  return parsed;
}

/**
 * Default serializer implementation
 */
export const serializer: Serializer = {
  toJSON,
  fromJSON,
};

export default serializer;
