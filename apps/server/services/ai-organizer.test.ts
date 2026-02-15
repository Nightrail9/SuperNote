/**
 * Property-Based Tests for AI Organizer Service
 *
 * Tests the extractContent function using fast-check to verify that
 * AI API response content is correctly extracted across many inputs.
 *
 * Run with: npx tsx apps/server/services/ai-organizer.test.ts
 *
 * Feature: backend-simplify, Property 7: AI 响应内容正确提取
 * Validates: Requirements 4.2
 */

import fc from 'fast-check';

import { extractContent } from './ai-organizer.js';

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

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) {
    testsPassed++;
    console.log(`✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`✗ ${message}`);
    console.error(`  Expected: ${JSON.stringify(expected)}`);
    console.error(`  Actual: ${JSON.stringify(actual)}`);
  }
}

// ============================================================================
// Property 7: AI 响应内容正确提取
// Feature: backend-simplify, Property 7: AI 响应内容正确提取
// Validates: Requirements 4.2
// ============================================================================

console.log('\n=== Property 7: AI 响应内容正确提取 ===\n');

// Property 7: For any AI API response containing one of the supported fields
// (organizedNotes, content, or result), extractContent should return that field's value.

try {
  fc.assert(
    fc.property(
      fc.oneof(
        // Generate response with organizedNotes field
        fc.string({ minLength: 1 }).map(s => ({
          fieldName: 'organizedNotes' as const,
          response: { organizedNotes: s } as Record<string, unknown>,
          expected: s,
        })),
        // Generate response with content field
        fc.string({ minLength: 1 }).map(s => ({
          fieldName: 'content' as const,
          response: { content: s } as Record<string, unknown>,
          expected: s,
        })),
        // Generate response with result field
        fc.string({ minLength: 1 }).map(s => ({
          fieldName: 'result' as const,
          response: { result: s } as Record<string, unknown>,
          expected: s,
        }))
      ),
      ({ response, expected }) => {
        const extracted = extractContent(response);
        return extracted === expected;
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 7: extractContent correctly extracts content from all supported field names');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 7: extractContent failed to extract content correctly');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 7 (priority): organizedNotes takes precedence over content and result
// ============================================================================

console.log('\n=== Property 7 (priority): organizedNotes 优先级最高 ===\n');

try {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      (organizedNotes, content, result) => {
        // When all three fields are present, organizedNotes should be returned
        const response: Record<string, unknown> = { organizedNotes, content, result };
        return extractContent(response) === organizedNotes;
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 7 (priority): organizedNotes takes precedence when all fields present');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 7 (priority): organizedNotes precedence failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 7 (fallback): content takes precedence over result
// ============================================================================

console.log('\n=== Property 7 (fallback): content 优先于 result ===\n');

try {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      (content, result) => {
        // When content and result are present (no organizedNotes), content should be returned
        const response: Record<string, unknown> = { content, result };
        return extractContent(response) === content;
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 7 (fallback): content takes precedence over result');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 7 (fallback): content precedence over result failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 7 (empty): returns empty string when no supported fields present
// ============================================================================

console.log('\n=== Property 7 (empty): 无支持字段时返回空字符串 ===\n');

try {
  fc.assert(
    fc.property(
      fc.dictionary(
        fc.string().filter(k => k !== 'organizedNotes' && k !== 'content' && k !== 'result'),
        fc.anything()
      ),
      (response) => {
        return extractContent(response as Record<string, unknown>) === '';
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 7 (empty): returns empty string when no supported fields present');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 7 (empty): empty string fallback failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 7 (non-string): non-string field values are ignored
// ============================================================================

console.log('\n=== Property 7 (non-string): 非字符串字段值被忽略 ===\n');

try {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
        fc.array(fc.anything()),
        fc.dictionary(fc.string(), fc.anything())
      ),
      (nonStringValue) => {
        // When the field value is not a string, extractContent should skip it
        const response: Record<string, unknown> = { organizedNotes: nonStringValue };
        return extractContent(response) === '';
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 7 (non-string): non-string field values are correctly ignored');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 7 (non-string): non-string handling failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Unit Tests - Specific Examples
// ============================================================================

console.log('\n=== Unit Tests: extractContent specific examples ===\n');

assertEquals(
  extractContent({ organizedNotes: '# Organized Notes' }),
  '# Organized Notes',
  'Should extract organizedNotes field'
);

assertEquals(
  extractContent({ content: 'Some content here' }),
  'Some content here',
  'Should extract content field'
);

assertEquals(
  extractContent({ result: 'Result text' }),
  'Result text',
  'Should extract result field'
);

assertEquals(
  extractContent({}),
  '',
  'Should return empty string for empty response'
);

assertEquals(
  extractContent({ other: 'value', data: 123 }),
  '',
  'Should return empty string when no supported fields exist'
);

assertEquals(
  extractContent({ organizedNotes: '', content: 'fallback' }),
  '',
  'Should return empty organizedNotes string (it is a string, even if empty)'
);

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
