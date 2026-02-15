/**
 * Property-Based Tests for Markdown Generator Service
 *
 * Tests the formatMarkdown function using fast-check to verify that
 * generated Markdown contains all PPT frame information.
 *
 * Run with: npx tsx apps/server/services/markdown-generator.test.ts
 *
 * Feature: backend-simplify, Property 5: Markdown 生成包含 PPT 内容
 * Validates: Requirements 3.4
 */

import fc from 'fast-check';

import { createMarkdownGenerator } from './markdown-generator.js';
import type { PPTData } from './markdown-generator.js';

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

/**
 * Generator for a non-empty URL string (simulating image URLs).
 * Constrains to realistic URL-like strings to match what formatMarkdown expects.
 */
const urlArb = fc.webUrl();

/**
 * Generator for a non-empty summary string.
 */
const summaryArb = fc.string({ minLength: 1 }).filter(s => s.trim().length > 0);

/**
 * Generator for a PPT frame with fileUrl and summary.
 */
const pptFrameArb = fc.record({
  fileUrl: urlArb,
  summary: summaryArb,
});

/**
 * Generator for PPT data with a non-empty keyFrameList.
 */
const pptDataArb = fc.record({
  keyFrameList: fc.array(pptFrameArb, { minLength: 1, maxLength: 20 }),
});

/**
 * Generator for a non-empty title string.
 */
const titleArb = fc.string({ minLength: 1 }).filter(s => s.trim().length > 0);

// ============================================================================
// Property 5: Markdown 生成包含 PPT 内容
// Feature: backend-simplify, Property 5: Markdown 生成包含 PPT 内容
// Validates: Requirements 3.4
// ============================================================================

const generator = createMarkdownGenerator();

console.log('\n=== Property 5: Markdown 生成包含 PPT 内容 ===\n');

// Property 5a: Generated Markdown contains the title
try {
  fc.assert(
    fc.property(
      titleArb,
      pptDataArb,
      (title, pptData) => {
        const markdown = generator.formatMarkdown(title, pptData as PPTData);
        return markdown.includes(title);
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 5a: formatMarkdown output contains the title');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 5a: formatMarkdown output does not contain the title');
  console.error(err instanceof Error ? err.message : String(err));
}

// Property 5b: Generated Markdown contains all frame image URLs
try {
  fc.assert(
    fc.property(
      titleArb,
      pptDataArb,
      (title, pptData) => {
        const markdown = generator.formatMarkdown(title, pptData as PPTData);
        return pptData.keyFrameList.every(frame => markdown.includes(frame.fileUrl));
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 5b: formatMarkdown output contains all frame image URLs');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 5b: formatMarkdown output does not contain all frame image URLs');
  console.error(err instanceof Error ? err.message : String(err));
}

// Property 5c: Generated Markdown contains all frame summaries
try {
  fc.assert(
    fc.property(
      titleArb,
      pptDataArb,
      (title, pptData) => {
        const markdown = generator.formatMarkdown(title, pptData as PPTData);
        return pptData.keyFrameList.every(frame => markdown.includes(frame.summary));
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 5c: formatMarkdown output contains all frame summaries');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 5c: formatMarkdown output does not contain all frame summaries');
  console.error(err instanceof Error ? err.message : String(err));
}

// Property 5d: Generated Markdown uses proper Markdown image syntax for each frame
try {
  fc.assert(
    fc.property(
      titleArb,
      pptDataArb,
      (title, pptData) => {
        const markdown = generator.formatMarkdown(title, pptData as PPTData);
        return pptData.keyFrameList.every(frame =>
          markdown.includes('![') && markdown.includes(`](${frame.fileUrl})`)
        );
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 5d: formatMarkdown output uses Markdown image syntax for all frames');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 5d: formatMarkdown output does not use Markdown image syntax');
  console.error(err instanceof Error ? err.message : String(err));
}

// Property 5e: Generated Markdown starts with a heading containing the title
try {
  fc.assert(
    fc.property(
      titleArb,
      pptDataArb,
      (title, pptData) => {
        const markdown = generator.formatMarkdown(title, pptData as PPTData);
        return markdown.startsWith(`# ${title}`);
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 5e: formatMarkdown output starts with heading containing title');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 5e: formatMarkdown output does not start with heading');
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
