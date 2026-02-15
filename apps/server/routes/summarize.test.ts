/**
 * Property-Based Tests for Summarize Route Validation
 *
 * Tests the validateSummarizeRequest function using fast-check to verify
 * that request validation correctly rejects invalid inputs across many
 * randomly generated cases.
 *
 * Run with: npx tsx apps/server/routes/summarize.test.ts
 *
 * Feature: backend-simplify
 * Properties: 1, 2, 3, 4, 9
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 7.1, 7.2
 */

import fc from 'fast-check';

import {
  validateSummarizeRequest,
  type SummarizeErrorResponse,
} from './summarize.js';

// ============================================================================
// Test Utilities
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    testsPassed++;
    console.log(`✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`✗ ${message}`);
  }
}

// ============================================================================
// Valid error stages as defined in the design document
// ============================================================================

const VALID_STAGES = [
  'validate', 'parse', 'download', 'upload',
  'transcribe', 'generate', 'ai_call', 'server',
];

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate a valid Bilibili URL.
 */
const validBilibiliUrl = fc.oneof(
  fc.stringMatching(/^[a-zA-Z0-9]{10,12}$/).map(id => `https://www.bilibili.com/video/BV${id}`),
  fc.nat({ max: 999999999 }).map(id => `https://www.bilibili.com/video/av${id}`),
  fc.stringMatching(/^[a-zA-Z0-9]{6,10}$/).map(id => `https://b23.tv/${id}`),
  fc.stringMatching(/^[a-zA-Z0-9]{10,12}$/).map(id => `https://m.bilibili.com/video/BV${id}`),
);

/**
 * Generate a valid HTTPS API URL.
 */
const validHttpsApiUrl = fc.stringMatching(/^[a-z]{3,10}$/).map(
  domain => `https://${domain}.example.com/api/v1/chat`
);

/**
 * Generate a valid complete request body.
 */
const validRequestBody = fc.record({
  url: validBilibiliUrl,
  apiUrl: validHttpsApiUrl,
  apiKey: fc.string({ minLength: 1 }),
  prompt: fc.string({ minLength: 1 }),
});

/**
 * Helper to check error response structure.
 */
function isValidErrorResponse(result: SummarizeErrorResponse | null): result is SummarizeErrorResponse {
  if (result === null) return false;
  return (
    result.success === false &&
    typeof result.error === 'object' &&
    result.error !== null &&
    typeof result.error.stage === 'string' &&
    typeof result.error.code === 'string' &&
    typeof result.error.message === 'string'
  );
}

// ============================================================================
// Property 1: 缺少 URL 字段的请求被拒绝
// Feature: backend-simplify, Property 1: 缺少 URL 字段的请求被拒绝
// Validates: Requirements 1.2
// ============================================================================

console.log('\n=== Property 1: 缺少 URL 字段的请求被拒绝 ===\n');

try {
  // Sub-property 1a: Missing url field entirely
  fc.assert(
    fc.property(
      fc.record({
        apiUrl: validHttpsApiUrl,
        apiKey: fc.string({ minLength: 1 }),
        prompt: fc.string({ minLength: 1 }),
      }),
      (body) => {
        const result = validateSummarizeRequest(body);
        return (
          isValidErrorResponse(result) &&
          result.error.stage === 'validate' &&
          result.error.code === 'MISSING_URL'
        );
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 1a: Missing url field is rejected with MISSING_URL');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1a: Missing url field rejection failed');
  console.error(err instanceof Error ? err.message : String(err));
}

try {
  // Sub-property 1b: Empty string url
  fc.assert(
    fc.property(
      fc.record({
        url: fc.constant(''),
        apiUrl: validHttpsApiUrl,
        apiKey: fc.string({ minLength: 1 }),
        prompt: fc.string({ minLength: 1 }),
      }),
      (body) => {
        const result = validateSummarizeRequest(body);
        return (
          isValidErrorResponse(result) &&
          result.error.stage === 'validate' &&
          result.error.code === 'MISSING_URL'
        );
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 1b: Empty string url is rejected with MISSING_URL');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1b: Empty string url rejection failed');
  console.error(err instanceof Error ? err.message : String(err));
}

try {
  // Sub-property 1c: Whitespace-only url
  fc.assert(
    fc.property(
      fc.nat({ max: 9 }).map(n => ' '.repeat(n + 1)),
      (spaces) => {
        const body = {
          url: spaces,
          apiUrl: 'https://api.example.com/v1/chat',
          apiKey: 'test-key',
          prompt: 'test prompt',
        };
        const result = validateSummarizeRequest(body);
        return (
          isValidErrorResponse(result) &&
          result.error.stage === 'validate' &&
          result.error.code === 'MISSING_URL'
        );
      }
    ),
    { numRuns: 50 }
  );
  testsPassed++;
  console.log('✓ Property 1c: Whitespace-only url is rejected with MISSING_URL');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1c: Whitespace-only url rejection failed');
  console.error(err instanceof Error ? err.message : String(err));
}

try {
  // Sub-property 1d: Non-string url values
  fc.assert(
    fc.property(
      fc.oneof(
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
        fc.array(fc.anything()),
      ),
      (urlValue) => {
        const body = {
          url: urlValue,
          apiUrl: 'https://api.example.com/v1/chat',
          apiKey: 'test-key',
          prompt: 'test prompt',
        };
        const result = validateSummarizeRequest(body);
        return (
          isValidErrorResponse(result) &&
          result.error.stage === 'validate' &&
          result.error.code === 'MISSING_URL'
        );
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 1d: Non-string url values are rejected with MISSING_URL');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1d: Non-string url values rejection failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 2: 非 Bilibili URL 被拒绝
// Feature: backend-simplify, Property 2: 非 Bilibili URL 被拒绝
// Validates: Requirements 1.3
// ============================================================================

console.log('\n=== Property 2: 非 Bilibili URL 被拒绝 ===\n');

try {
  fc.assert(
    fc.property(
      fc.webUrl().filter(url => {
        // Filter out any URL that could match the Bilibili pattern
        const lower = url.toLowerCase();
        return (
          !lower.includes('bilibili.com/video/bv') &&
          !lower.includes('bilibili.com/video/av') &&
          !lower.includes('b23.tv/')
        );
      }),
      (nonBilibiliUrl) => {
        const body = {
          url: nonBilibiliUrl,
          apiUrl: 'https://api.example.com/v1/chat',
          apiKey: 'test-key',
          prompt: 'test prompt',
        };
        const result = validateSummarizeRequest(body);
        return (
          isValidErrorResponse(result) &&
          result.error.stage === 'validate' &&
          result.error.code === 'INVALID_URL'
        );
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 2: Non-Bilibili URLs are rejected with INVALID_URL');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 2: Non-Bilibili URL rejection failed');
  console.error(err instanceof Error ? err.message : String(err));
}

try {
  // Property 2b: Common non-Bilibili domains
  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant('https://www.youtube.com/watch?v=abc123'),
        fc.constant('https://vimeo.com/123456'),
        fc.constant('https://www.google.com'),
        fc.constant('https://example.com/video/BV123'),
        fc.constant('http://not-bilibili.com/video/BV123abc'),
        fc.stringMatching(/^[a-z]{3,8}$/).map(d => `https://${d}.com/path`),
      ),
      (url) => {
        const body = {
          url,
          apiUrl: 'https://api.example.com/v1/chat',
          apiKey: 'test-key',
          prompt: 'test prompt',
        };
        const result = validateSummarizeRequest(body);
        return (
          isValidErrorResponse(result) &&
          result.error.stage === 'validate' &&
          result.error.code === 'INVALID_URL'
        );
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 2b: Common non-Bilibili domains are rejected with INVALID_URL');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 2b: Common non-Bilibili domain rejection failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 3: 缺少 AI 配置参数的请求被拒绝
// Feature: backend-simplify, Property 3: 缺少 AI 配置参数的请求被拒绝
// Validates: Requirements 1.4
// ============================================================================

console.log('\n=== Property 3: 缺少 AI 配置参数的请求被拒绝 ===\n');

try {
  // Generate a valid Bilibili URL and randomly remove one or more AI config fields
  const aiConfigFields = ['apiUrl', 'apiKey', 'prompt'] as const;

  fc.assert(
    fc.property(
      validBilibiliUrl,
      // Generate a non-empty subset of fields to remove
      fc.subarray(aiConfigFields, { minLength: 1 }),
      (url, fieldsToRemove) => {
        const body: Record<string, string> = {
          url,
          apiUrl: 'https://api.example.com/v1/chat',
          apiKey: 'test-api-key-123',
          prompt: 'Summarize this video',
        };

        // Remove selected fields
        for (const field of fieldsToRemove) {
          delete body[field];
        }

        const result = validateSummarizeRequest(body);
        return (
          isValidErrorResponse(result) &&
          result.error.stage === 'validate' &&
          result.error.code === 'MISSING_AI_CONFIG'
        );
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 3: Missing AI config fields are rejected with MISSING_AI_CONFIG');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 3: Missing AI config fields rejection failed');
  console.error(err instanceof Error ? err.message : String(err));
}

try {
  // Property 3b: Empty string AI config fields should also be rejected
  fc.assert(
    fc.property(
      validBilibiliUrl,
      fc.subarray(['apiUrl', 'apiKey', 'prompt'] as const, { minLength: 1 }),
      (url, fieldsToEmpty) => {
        const body: Record<string, string> = {
          url,
          apiUrl: 'https://api.example.com/v1/chat',
          apiKey: 'test-api-key-123',
          prompt: 'Summarize this video',
        };

        // Set selected fields to empty string
        for (const field of fieldsToEmpty) {
          body[field] = '';
        }

        const result = validateSummarizeRequest(body);
        return (
          isValidErrorResponse(result) &&
          result.error.stage === 'validate' &&
          result.error.code === 'MISSING_AI_CONFIG'
        );
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 3b: Empty string AI config fields are rejected with MISSING_AI_CONFIG');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 3b: Empty string AI config fields rejection failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 4: 非 HTTPS 的 API URL 被拒绝
// Feature: backend-simplify, Property 4: 非 HTTPS 的 API URL 被拒绝
// Validates: Requirements 1.5
// ============================================================================

console.log('\n=== Property 4: 非 HTTPS 的 API URL 被拒绝 ===\n');

try {
  fc.assert(
    fc.property(
      validBilibiliUrl,
      // Generate HTTP (non-HTTPS) URLs
      fc.stringMatching(/^[a-z]{3,10}$/).map(
        domain => `http://${domain}.example.com/api/v1/chat`
      ),
      // Use non-whitespace strings so validation reaches the HTTPS check
      fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
      fc.stringMatching(/^[a-zA-Z0-9 ]{1,30}$/).filter(s => s.trim().length > 0),
      (url, httpApiUrl, apiKey, prompt) => {
        const body = { url, apiUrl: httpApiUrl, apiKey, prompt };
        const result = validateSummarizeRequest(body);
        return (
          isValidErrorResponse(result) &&
          result.error.stage === 'validate' &&
          result.error.code === 'INVALID_API_URL'
        );
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 4: Non-HTTPS API URLs are rejected with INVALID_API_URL');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 4: Non-HTTPS API URL rejection failed');
  console.error(err instanceof Error ? err.message : String(err));
}

try {
  // Property 4b: Various non-HTTPS protocols
  fc.assert(
    fc.property(
      validBilibiliUrl,
      fc.oneof(
        fc.constant('http://api.example.com/v1'),
        fc.constant('ftp://api.example.com/v1'),
        fc.constant('ws://api.example.com/v1'),
      ),
      (url, nonHttpsUrl) => {
        const body = {
          url,
          apiUrl: nonHttpsUrl,
          apiKey: 'test-key',
          prompt: 'test prompt',
        };
        const result = validateSummarizeRequest(body);
        return (
          isValidErrorResponse(result) &&
          result.error.stage === 'validate' &&
          result.error.code === 'INVALID_API_URL'
        );
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 4b: Various non-HTTPS protocols are rejected with INVALID_API_URL');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 4b: Various non-HTTPS protocol rejection failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 9: 统一错误响应格式
// Feature: backend-simplify, Property 9: 统一错误响应格式
// Validates: Requirements 7.1, 7.2
// ============================================================================

console.log('\n=== Property 9: 统一错误响应格式 ===\n');

try {
  // Generate various invalid inputs and verify all error responses have the correct format
  const invalidInputGenerator = fc.oneof(
    // Missing url
    fc.record({
      apiUrl: fc.constant('https://api.example.com/v1'),
      apiKey: fc.string({ minLength: 1 }),
      prompt: fc.string({ minLength: 1 }),
    }),
    // Empty url
    fc.record({
      url: fc.constant(''),
      apiUrl: fc.constant('https://api.example.com/v1'),
      apiKey: fc.string({ minLength: 1 }),
      prompt: fc.string({ minLength: 1 }),
    }),
    // Non-Bilibili URL
    fc.record({
      url: fc.stringMatching(/^[a-z]{3,8}$/).map(d => `https://${d}.com/video`),
      apiUrl: fc.constant('https://api.example.com/v1'),
      apiKey: fc.string({ minLength: 1 }),
      prompt: fc.string({ minLength: 1 }),
    }),
    // Missing AI config (missing apiUrl)
    fc.record({
      url: fc.constant('https://www.bilibili.com/video/BV1abc123def'),
      apiKey: fc.string({ minLength: 1 }),
      prompt: fc.string({ minLength: 1 }),
    }),
    // Non-HTTPS apiUrl
    fc.record({
      url: fc.constant('https://www.bilibili.com/video/BV1abc123def'),
      apiUrl: fc.constant('http://api.example.com/v1'),
      apiKey: fc.string({ minLength: 1 }),
      prompt: fc.string({ minLength: 1 }),
    }),
  );

  fc.assert(
    fc.property(
      invalidInputGenerator,
      (body) => {
        const result = validateSummarizeRequest(body);

        // Must be a non-null error response
        if (result === null) return false;

        // Must have success: false
        if (result.success !== false) return false;

        // Must have error object with stage, code, message
        if (typeof result.error !== 'object' || result.error === null) return false;
        if (typeof result.error.stage !== 'string') return false;
        if (typeof result.error.code !== 'string') return false;
        if (typeof result.error.message !== 'string') return false;

        // Stage must be one of the valid stages
        if (!VALID_STAGES.includes(result.error.stage)) return false;

        // Code and message must be non-empty
        if (result.error.code.length === 0) return false;
        if (result.error.message.length === 0) return false;

        return true;
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 9: All error responses follow unified format with valid stage');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 9: Unified error response format check failed');
  console.error(err instanceof Error ? err.message : String(err));
}

try {
  // Property 9b: All validation errors specifically use 'validate' stage
  fc.assert(
    fc.property(
      fc.oneof(
        // Missing url
        fc.constant({}),
        // Empty url
        fc.constant({ url: '' }),
        // Non-Bilibili URL
        fc.constant({ url: 'https://youtube.com/watch?v=abc' }),
        // Missing AI config
        fc.constant({ url: 'https://www.bilibili.com/video/BV1abc123def' }),
        // Non-HTTPS apiUrl
        fc.constant({
          url: 'https://www.bilibili.com/video/BV1abc123def',
          apiUrl: 'http://api.example.com/v1',
          apiKey: 'key',
          prompt: 'prompt',
        }),
      ),
      (body) => {
        const result = validateSummarizeRequest(body);
        if (result === null) return false;
        return result.error.stage === 'validate';
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 9b: All validation errors use stage "validate"');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 9b: Validation stage check failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Unit Tests - Specific Examples
// ============================================================================

console.log('\n=== Unit Tests: validateSummarizeRequest specific examples ===\n');

// Valid request should return null
{
  const result = validateSummarizeRequest({
    url: 'https://www.bilibili.com/video/BV1abc123def',
    apiUrl: 'https://api.openai.com/v1/chat',
    apiKey: 'sk-test-key',
    prompt: 'Summarize this video',
  });
  assert(result === null, 'Valid request should return null');
}

// Missing url should return MISSING_URL
{
  const result = validateSummarizeRequest({
    apiUrl: 'https://api.openai.com/v1/chat',
    apiKey: 'sk-test-key',
    prompt: 'Summarize',
  });
  assert(
    isValidErrorResponse(result) && result.error.code === 'MISSING_URL',
    'Missing url should return MISSING_URL'
  );
}

// Non-Bilibili URL should return INVALID_URL
{
  const result = validateSummarizeRequest({
    url: 'https://www.youtube.com/watch?v=abc123',
    apiUrl: 'https://api.openai.com/v1/chat',
    apiKey: 'sk-test-key',
    prompt: 'Summarize',
  });
  assert(
    isValidErrorResponse(result) && result.error.code === 'INVALID_URL',
    'Non-Bilibili URL should return INVALID_URL'
  );
}

// Missing apiKey should return MISSING_AI_CONFIG
{
  const result = validateSummarizeRequest({
    url: 'https://www.bilibili.com/video/BV1abc123def',
    apiUrl: 'https://api.openai.com/v1/chat',
    prompt: 'Summarize',
  });
  assert(
    isValidErrorResponse(result) && result.error.code === 'MISSING_AI_CONFIG',
    'Missing apiKey should return MISSING_AI_CONFIG'
  );
}

// HTTP apiUrl should return INVALID_API_URL
{
  const result = validateSummarizeRequest({
    url: 'https://www.bilibili.com/video/BV1abc123def',
    apiUrl: 'http://api.openai.com/v1/chat',
    apiKey: 'sk-test-key',
    prompt: 'Summarize',
  });
  assert(
    isValidErrorResponse(result) && result.error.code === 'INVALID_API_URL',
    'HTTP apiUrl should return INVALID_API_URL'
  );
}

// b23.tv URL should be accepted
{
  const result = validateSummarizeRequest({
    url: 'https://b23.tv/abc123',
    apiUrl: 'https://api.openai.com/v1/chat',
    apiKey: 'sk-test-key',
    prompt: 'Summarize',
  });
  assert(result === null, 'b23.tv URL should be accepted as valid');
}

// m.bilibili.com URL should be accepted
{
  const result = validateSummarizeRequest({
    url: 'https://m.bilibili.com/video/BV1abc123def',
    apiUrl: 'https://api.openai.com/v1/chat',
    apiKey: 'sk-test-key',
    prompt: 'Summarize',
  });
  assert(result === null, 'm.bilibili.com URL should be accepted as valid');
}

// ============================================================================
// Test Summary
// ============================================================================

console.log('\n=== Test Summary ===\n');
console.log(`Total tests: ${testsPassed + testsFailed}`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✓ All tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
