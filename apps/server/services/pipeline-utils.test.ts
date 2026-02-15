/**
 * Property-Based Tests for Pipeline Utils
 *
 * Tests the buildDisplayTitle function using fast-check to verify that
 * title construction is consistent after migration from video-processor.ts.
 *
 * Run with: npx tsx apps/server/services/pipeline-utils.test.ts
 *
 * Feature: backend-simplification, Property 1: buildDisplayTitle 标题构建一致性
 * Validates: Requirements 2.2
 */

import fc from 'fast-check';

import { buildDisplayTitle } from './pipeline-utils.js';

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
// Generators
// ============================================================================

/**
 * Generate a non-empty trimmed string that won't accidentally match
 * the part prefix pattern (avoids strings starting with 'P' + digits)
 * and won't start with separator characters that the regex would consume.
 */
const safeTitleArb = fc.string({ minLength: 1, maxLength: 30 })
  .map(s => s.replace(/^\s+|\s+$/g, '').replace(/^[-_:|]+\s*/, ''))
  .filter(s => s.length > 0 && !/^P\s*\d/i.test(s));

/**
 * Generate a positive integer for part numbers.
 */
const partArb = fc.integer({ min: 1, max: 9999 });

/**
 * Generate a non-empty video title (trimmed).
 */
const videoTitleArb = fc.string({ minLength: 1, maxLength: 40 })
  .map(s => s.replace(/^\s+|\s+$/g, ''))
  .filter(s => s.length > 0);

/**
 * Generate a separator character used in Bilibili part title prefixes.
 */
const separatorArb = fc.constantFrom('-', '_', ':', '|');

// ============================================================================
// Property 1: buildDisplayTitle 标题构建一致性
// Feature: backend-simplification, Property 1: buildDisplayTitle 标题构建一致性
// Validates: Requirements 2.2
// ============================================================================

console.log('\n=== Property 1: buildDisplayTitle 标题构建一致性 ===\n');

// ──────────────────────────────────────────────────────────────────────────
// Property 1a: When partTitle is empty/undefined, result is videoTitle or P{part}
// ──────────────────────────────────────────────────────────────────────────

console.log('--- Property 1a: Empty/undefined partTitle fallback ---\n');

try {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 50 }),
      partArb,
      fc.constantFrom(undefined, '', '   ', '\t', '\n'),
      (videoTitle, part, partTitle) => {
        const result = buildDisplayTitle(videoTitle, part, partTitle);
        const trimmedVideo = videoTitle.trim();
        if (trimmedVideo) {
          return result === trimmedVideo;
        } else {
          return result === `P${part}`;
        }
      }
    ),
    { numRuns: 200 }
  );
  testsPassed++;
  console.log('✓ Property 1a: Empty/undefined partTitle falls back to videoTitle or P{part}');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1a: Empty/undefined partTitle fallback failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ──────────────────────────────────────────────────────────────────────────
// Property 1b: When partTitle has no prefix to strip, result is trimmed partTitle
// ──────────────────────────────────────────────────────────────────────────

console.log('\n--- Property 1b: No prefix match returns trimmed partTitle ---\n');

try {
  fc.assert(
    fc.property(
      videoTitleArb,
      partArb,
      safeTitleArb,
      (videoTitle, part, partTitle) => {
        const result = buildDisplayTitle(videoTitle, part, partTitle);
        return result === partTitle.trim();
      }
    ),
    { numRuns: 200 }
  );
  testsPassed++;
  console.log('✓ Property 1b: No prefix match returns trimmed partTitle as-is');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1b: No prefix match returns trimmed partTitle failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ──────────────────────────────────────────────────────────────────────────
// Property 1c: Full prefix "<videoTitle> <sep> P<part> <sep> <rest>" is stripped
// ──────────────────────────────────────────────────────────────────────────

console.log('\n--- Property 1c: Full prefix stripping ---\n');

try {
  fc.assert(
    fc.property(
      videoTitleArb,
      partArb,
      separatorArb,
      fc.option(separatorArb, { nil: undefined }),
      safeTitleArb,
      (videoTitle, part, sep1, sep2, rest) => {
        const trimmedTitle = videoTitle.trim();
        const partPrefix = `P${part}`;
        const partTitleStr = sep2
          ? `${trimmedTitle} ${sep1} ${partPrefix} ${sep2} ${rest}`
          : `${trimmedTitle} ${sep1} ${partPrefix} ${rest}`;
        const result = buildDisplayTitle(videoTitle, part, partTitleStr);
        // Should strip the prefix and return rest (trimmed)
        return result === rest.trim();
      }
    ),
    { numRuns: 200 }
  );
  testsPassed++;
  console.log('✓ Property 1c: Full prefix "<videoTitle> <sep> P<part> ..." is correctly stripped');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1c: Full prefix stripping failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ──────────────────────────────────────────────────────────────────────────
// Property 1d: Part-only prefix "P<part> <rest>" is stripped
// ──────────────────────────────────────────────────────────────────────────

console.log('\n--- Property 1d: Part-only prefix stripping ---\n');

try {
  fc.assert(
    fc.property(
      videoTitleArb,
      partArb,
      fc.option(separatorArb, { nil: undefined }),
      safeTitleArb,
      (videoTitle, part, sep, rest) => {
        const partTitleStr = sep
          ? `P${part} ${sep} ${rest}`
          : `P${part} ${rest}`;
        const result = buildDisplayTitle(videoTitle, part, partTitleStr);
        return result === rest.trim();
      }
    ),
    { numRuns: 200 }
  );
  testsPassed++;
  console.log('✓ Property 1d: Part-only prefix "P<part> ..." is correctly stripped');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1d: Part-only prefix stripping failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ──────────────────────────────────────────────────────────────────────────
// Property 1e: Result is never empty string — always returns meaningful title
// ──────────────────────────────────────────────────────────────────────────

console.log('\n--- Property 1e: Result is never empty ---\n');

try {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 50 }),
      partArb,
      fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
      (videoTitle, part, partTitle) => {
        const result = buildDisplayTitle(videoTitle, part, partTitle);
        return result.length > 0;
      }
    ),
    { numRuns: 200 }
  );
  testsPassed++;
  console.log('✓ Property 1e: buildDisplayTitle never returns an empty string');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1e: Non-empty result property failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ──────────────────────────────────────────────────────────────────────────
// Property 1f: Full prefix with empty rest falls back to P{part}
// ──────────────────────────────────────────────────────────────────────────

console.log('\n--- Property 1f: Full prefix with empty rest falls back to P{part} ---\n');

try {
  fc.assert(
    fc.property(
      videoTitleArb,
      partArb,
      separatorArb,
      (videoTitle, part, sep) => {
        const trimmedTitle = videoTitle.trim();
        // Construct a partTitle that is just the prefix with no meaningful rest
        const partTitleStr = `${trimmedTitle} ${sep} P${part}`;
        const result = buildDisplayTitle(videoTitle, part, partTitleStr);
        return result === `P${part}`;
      }
    ),
    { numRuns: 200 }
  );
  testsPassed++;
  console.log('✓ Property 1f: Full prefix with empty rest correctly falls back to P{part}');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 1f: Full prefix empty rest fallback failed');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Unit Tests - Specific Examples
// Feature: backend-simplification, Property 1: buildDisplayTitle 标题构建一致性
// Validates: Requirements 2.2
// ============================================================================

console.log('\n=== Unit Tests: buildDisplayTitle specific examples ===\n');

// --- Fallback behavior when partTitle is empty/undefined ---

assertEquals(
  buildDisplayTitle('My Video', 1),
  'My Video',
  'undefined partTitle: should return videoTitle'
);

assertEquals(
  buildDisplayTitle('My Video', 1, ''),
  'My Video',
  'empty partTitle: should return videoTitle'
);

assertEquals(
  buildDisplayTitle('My Video', 1, '   '),
  'My Video',
  'whitespace-only partTitle: should return videoTitle'
);

assertEquals(
  buildDisplayTitle('', 3),
  'P3',
  'empty videoTitle and no partTitle: should return P{part}'
);

assertEquals(
  buildDisplayTitle('  ', 5, ''),
  'P5',
  'whitespace videoTitle and empty partTitle: should return P{part}'
);

// --- No prefix to strip ---

assertEquals(
  buildDisplayTitle('My Video', 1, 'Introduction'),
  'Introduction',
  'partTitle with no prefix: should return partTitle as-is'
);

assertEquals(
  buildDisplayTitle('My Video', 1, '  Introduction  '),
  'Introduction',
  'partTitle with whitespace: should return trimmed partTitle'
);

// --- Full prefix stripping: "<videoTitle> - P<N> <rest>" ---

assertEquals(
  buildDisplayTitle('My Video', 27, 'My Video - P27 Chapter One'),
  'Chapter One',
  'full prefix with dash separator: should strip and return rest'
);

assertEquals(
  buildDisplayTitle('My Video', 3, 'My Video - P3 Introduction'),
  'Introduction',
  'full prefix with single-digit part: should strip and return rest'
);

assertEquals(
  buildDisplayTitle('My Video', 1, 'My Video | P1 Overview'),
  'Overview',
  'full prefix with pipe separator: should strip and return rest'
);

assertEquals(
  buildDisplayTitle('My Video', 5, 'My Video : P5 Details'),
  'Details',
  'full prefix with colon separator: should strip and return rest'
);

// --- Part-only prefix stripping: "P<N> <rest>" ---

assertEquals(
  buildDisplayTitle('My Video', 27, 'P27 Chapter One'),
  'Chapter One',
  'part-only prefix: should strip P27 and return rest'
);

assertEquals(
  buildDisplayTitle('My Video', 1, 'P1 Introduction'),
  'Introduction',
  'part-only prefix P1: should strip and return rest'
);

assertEquals(
  buildDisplayTitle('My Video', 3, 'P3 - Details'),
  'Details',
  'part-only prefix with dash: should strip P3 - and return rest'
);

// --- Full prefix with empty rest falls back to P{part} ---

assertEquals(
  buildDisplayTitle('My Video', 5, 'My Video - P5'),
  'P5',
  'full prefix with no rest: should fall back to P{part}'
);

assertEquals(
  buildDisplayTitle('My Video', 1, 'P1'),
  'P1',
  'part-only prefix with no rest: should fall back to P{part}'
);

// --- Leading zeros in part number ---

assertEquals(
  buildDisplayTitle('My Video', 3, 'P003 Chapter'),
  'Chapter',
  'part-only prefix with leading zeros: should strip and return rest'
);

// --- Case insensitivity ---

assertEquals(
  buildDisplayTitle('My Video', 1, 'my video - p1 Intro'),
  'Intro',
  'case-insensitive full prefix match: should strip and return rest'
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
