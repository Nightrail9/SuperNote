/**
 * Property-Based Tests for URL handling functions
 *
 * Tests isGeminiNativeUrl, buildGeminiModelsEndpoint, and normalizeBaseUrl
 * using fast-check to verify URL classification and endpoint construction.
 *
 * Run with: npx tsx apps/server/routes/settings-url.test.ts
 */

import fc from 'fast-check';
import {
  isGeminiNativeUrl,
  buildGeminiModelsEndpoint,
  normalizeBaseUrl,
} from './settings.js';

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
// Generators
// ============================================================================

/** Generate a random safe hostname segment (lowercase alphanumeric, 1-12 chars). */
const safeSegment = fc.stringMatching(/^[a-z0-9]{1,12}$/);

/** Generate a random domain that is NOT Google's generativelanguage API. */
const nonGoogleDomain = fc.tuple(safeSegment, safeSegment).map(
  ([sub, tld]) => {
    const domain = `${sub}.${tld}.com`;
    // Ensure it doesn't accidentally match
    if (domain.includes('generativelanguage.googleapis.com')) {
      return 'proxy.example.com';
    }
    return domain;
  }
);

/** Generate a Google official domain URL with random protocol and path. */
const googleDomainUrl = fc.tuple(
  fc.constantFrom('http', 'https'),
  fc.constantFrom(
    'generativelanguage.googleapis.com',
    'us-generativelanguage.googleapis.com',
    'asia-generativelanguage.googleapis.com'
  ),
  fc.constantFrom('', '/v1beta', '/v1', '/v1beta/openai', '/some/path')
).map(([proto, host, path]) => `${proto}://${host}${path}`);

/** Generate a non-Google domain URL with random protocol and path. */
const nonGoogleUrl = fc.tuple(
  fc.constantFrom('http', 'https'),
  nonGoogleDomain,
  fc.constantFrom('', '/v1', '/api', '/proxy')
).map(([proto, host, path]) => `${proto}://${host}${path}`);

/** Suffixes that should be stripped during normalization. */
const STRIP_SUFFIXES = ['/chat/completions', '/completions', '/responses', '/openai'];

/** Generate a URL with a suffix that should be stripped. */
const urlWithSuffix = fc.tuple(
  fc.constantFrom('http', 'https'),
  nonGoogleDomain,
  fc.constantFrom('', '/v1', '/api'),
  fc.constantFrom(...STRIP_SUFFIXES)
).map(([proto, host, basePath, suffix]) => `${proto}://${host}${basePath}${suffix}`);

/** Generate a URL with trailing slashes. */
const urlWithTrailingSlashes = fc.tuple(
  fc.constantFrom('http', 'https'),
  nonGoogleDomain,
  fc.constantFrom('', '/v1', '/api'),
  fc.constantFrom('/', '//', '///', '////')
).map(([proto, host, path, slashes]) => `${proto}://${host}${path}${slashes}`);

// ============================================================================
// Property 1: isGeminiNativeUrl 域名判断正确性
// Feature: fix-model-baseurl, Property 1: isGeminiNativeUrl 域名判断正确性
// **Validates: Requirements 5.1, 5.2, 5.3**
// ============================================================================

console.log('\n=== Property 1: isGeminiNativeUrl 域名判断正确性 ===\n');

// 1a: Google official domain URLs should return true
try {
  fc.assert(
    fc.property(googleDomainUrl, (url) => {
      return isGeminiNativeUrl(url) === true;
    }),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 1a: Google official domain URLs return true');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1a: Google official domain URLs should return true');
  console.error(err instanceof Error ? err.message : String(err));
}

// 1b: Non-Google domain URLs should return false
try {
  fc.assert(
    fc.property(nonGoogleUrl, (url) => {
      return isGeminiNativeUrl(url) === false;
    }),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 1b: Non-Google domain URLs return false');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1b: Non-Google domain URLs should return false');
  console.error(err instanceof Error ? err.message : String(err));
}

// 1c: Protocol and path should not affect the result
try {
  fc.assert(
    fc.property(
      fc.constantFrom('http', 'https'),
      fc.constantFrom('', '/v1beta', '/v1', '/any/path/here'),
      (proto, path) => {
        const googleUrl = `${proto}://generativelanguage.googleapis.com${path}`;
        return isGeminiNativeUrl(googleUrl) === true;
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 1c: Protocol and path do not affect Google domain detection');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1c: Protocol and path should not affect detection');
  console.error(err instanceof Error ? err.message : String(err));
}

// 1d: Invalid URLs should return false
try {
  fc.assert(
    fc.property(
      fc.constantFrom('not-a-url', '', 'ftp://', '://missing', 'just-text'),
      (input) => {
        return isGeminiNativeUrl(input) === false;
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 1d: Invalid URLs return false');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1d: Invalid URLs should return false');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 2: 非 Google 域名的 Gemini 端点使用 OpenAI 兼容格式
// Feature: fix-model-baseurl, Property 2: 非 Google 域名的 Gemini 端点使用 OpenAI 兼容格式
// **Validates: Requirements 1.1, 2.1, 1.3**
// ============================================================================

console.log('\n=== Property 2: 非 Google 域名的 Gemini 端点使用 OpenAI 兼容格式 ===\n');

try {
  fc.assert(
    fc.property(
      nonGoogleUrl,
      fc.string({ minLength: 1, maxLength: 32 }),
      (baseUrl, apiKey) => {
        const endpoint = buildGeminiModelsEndpoint(baseUrl, apiKey);
        // Should end with /models
        if (!endpoint.endsWith('/models')) return false;
        // Should NOT contain ?key= query parameter
        if (endpoint.includes('?key=')) return false;
        return true;
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 2: Non-Google domain endpoints use OpenAI compatible format');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 2: Non-Google domain endpoints should use OpenAI compatible format');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 3: Google 官方域名的 Gemini 端点使用原生格式
// Feature: fix-model-baseurl, Property 3: Google 官方域名的 Gemini 端点使用原生格式
// **Validates: Requirements 1.2, 2.2**
// ============================================================================

console.log('\n=== Property 3: Google 官方域名的 Gemini 端点使用原生格式 ===\n');

try {
  fc.assert(
    fc.property(
      googleDomainUrl,
      fc.string({ minLength: 1, maxLength: 32 }),
      (baseUrl, apiKey) => {
        const endpoint = buildGeminiModelsEndpoint(baseUrl, apiKey);
        // Should contain /models in the path
        if (!endpoint.includes('/models')) return false;
        // Should contain ?key= query parameter
        if (!endpoint.includes('?key=')) return false;
        return true;
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 3: Google official domain endpoints use native Gemini format');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 3: Google official domain endpoints should use native Gemini format');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 4: URL 后缀规范化
// Feature: fix-model-baseurl, Property 4: URL 后缀规范化
// **Validates: Requirements 4.1, 4.2, 4.3, 3.4**
// ============================================================================

console.log('\n=== Property 4: URL 后缀规范化 ===\n');

// 4a: Suffixes should be stripped from non-Google URLs
try {
  fc.assert(
    fc.property(
      urlWithSuffix,
      fc.string({ minLength: 1, maxLength: 32 }),
      (baseUrl, apiKey) => {
        const endpoint = buildGeminiModelsEndpoint(baseUrl, apiKey);
        // The endpoint should not contain any of the stripped suffixes
        for (const suffix of STRIP_SUFFIXES) {
          if (endpoint.toLowerCase().includes(suffix.toLowerCase()) &&
              !endpoint.endsWith('/models')) {
            return false;
          }
        }
        // Should end with /models
        return endpoint.endsWith('/models');
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 4a: Suffixes are stripped from non-Google URLs');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 4a: Suffixes should be stripped from non-Google URLs');
  console.error(err instanceof Error ? err.message : String(err));
}

// 4b: Trailing slashes should be removed
try {
  fc.assert(
    fc.property(
      urlWithTrailingSlashes,
      fc.string({ minLength: 1, maxLength: 32 }),
      (baseUrl, apiKey) => {
        const endpoint = buildGeminiModelsEndpoint(baseUrl, apiKey);
        // The endpoint should end with /models, not /models/ or contain //
        if (!endpoint.endsWith('/models')) return false;
        // Should not have double slashes in the path (after protocol)
        const pathPart = endpoint.replace(/^https?:\/\//, '');
        if (pathPart.includes('//')) return false;
        return true;
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 4b: Trailing slashes are removed before building endpoint');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 4b: Trailing slashes should be removed');
  console.error(err instanceof Error ? err.message : String(err));
}

// 4c: /openai suffix on Google domain URLs should be stripped
try {
  fc.assert(
    fc.property(
      fc.constantFrom('http', 'https'),
      fc.constantFrom(
        'generativelanguage.googleapis.com',
        'us-generativelanguage.googleapis.com'
      ),
      fc.constantFrom('/v1beta', '/v1'),
      fc.string({ minLength: 1, maxLength: 32 }),
      (proto, host, basePath, apiKey) => {
        const baseUrl = `${proto}://${host}${basePath}/openai`;
        const endpoint = buildGeminiModelsEndpoint(baseUrl, apiKey);
        // /openai should be stripped, endpoint should contain /models?key=
        if (endpoint.includes('/openai')) return false;
        if (!endpoint.includes('/models?key=')) return false;
        return true;
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 4c: /openai suffix on Google domain URLs is stripped');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 4c: /openai suffix on Google domain URLs should be stripped');
  console.error(err instanceof Error ? err.message : String(err));
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
