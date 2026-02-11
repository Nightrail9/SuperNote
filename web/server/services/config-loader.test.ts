/**
 * Property-Based Tests for Config Loader
 *
 * Tests the validateConfig function using fast-check to verify that
 * missing required environment variables are correctly reported.
 *
 * Run with: npx tsx web/server/services/config-loader.test.ts
 *
 * Feature: backend-simplify, Property 8: 缺失环境变量的配置错误报告
 * Validates: Requirements 6.2
 */

import fc from 'fast-check';
import { validateConfig, type VideoProcessorEnvConfig } from './config-loader.js';

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
// Constants
// ============================================================================

/**
 * Mapping from config field names to the environment variable names
 * that validateConfig reports in its error message.
 */
const REQUIRED_FIELDS: { field: keyof VideoProcessorEnvConfig; envVar: string }[] = [
  { field: 'tingwuAppKey', envVar: 'TINGWU_APP_KEY' },
  { field: 'aliyunAccessKeyId', envVar: 'ALIYUN_ACCESS_KEY_ID' },
  { field: 'aliyunAccessKeySecret', envVar: 'ALIYUN_ACCESS_KEY_SECRET' },
  { field: 'ossBucket', envVar: 'OSS_BUCKET' },
];

/**
 * A complete valid config where all required fields are present.
 */
const VALID_CONFIG: VideoProcessorEnvConfig = {
  tingwuAppKey: 'test-app-key',
  aliyunAccessKeyId: 'test-access-key-id',
  aliyunAccessKeySecret: 'test-access-key-secret',
  ossRegion: 'oss-cn-hangzhou',
  ossBucket: 'test-bucket',
};

// ============================================================================
// Property 8: 缺失环境变量的配置错误报告
// Feature: backend-simplify, Property 8: 缺失环境变量的配置错误报告
// Validates: Requirements 6.2
// ============================================================================

console.log('\n=== Property 8: 缺失环境变量的配置错误报告 ===\n');

// Property 8: For any non-empty subset of required Aliyun environment variables
// that are missing, validateConfig should throw an error whose message contains
// ALL of the missing variable names.

try {
  fc.assert(
    fc.property(
      // Generate a non-empty subset of indices into REQUIRED_FIELDS to mark as missing
      fc.subarray(REQUIRED_FIELDS, { minLength: 1 }),
      (missingFields) => {
        // Build a config with the selected fields set to empty string (simulating missing)
        const config: Partial<VideoProcessorEnvConfig> = { ...VALID_CONFIG };
        for (const { field } of missingFields) {
          (config as Record<string, string>)[field] = '';
        }

        // validateConfig should throw
        let threw = false;
        let errorMessage = '';
        try {
          validateConfig(config);
        } catch (err) {
          threw = true;
          errorMessage = err instanceof Error ? err.message : String(err);
        }

        if (!threw) {
          return false;
        }

        // The error message should contain ALL missing variable names
        for (const { envVar } of missingFields) {
          if (!errorMessage.includes(envVar)) {
            return false;
          }
        }

        return true;
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 8: validateConfig reports all missing variable names in error');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 8: validateConfig failed to report missing variables correctly');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 8 (no-throw): validateConfig does NOT throw when all required
// fields are present with non-empty values
// ============================================================================

console.log('\n=== Property 8 (no-throw): 所有必需变量存在时不抛出错误 ===\n');

try {
  fc.assert(
    fc.property(
      // Generate non-empty strings for each required field
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      (tingwuAppKey, aliyunAccessKeyId, aliyunAccessKeySecret, ossBucket) => {
        const config: VideoProcessorEnvConfig = {
          tingwuAppKey,
          aliyunAccessKeyId,
          aliyunAccessKeySecret,
          ossRegion: 'oss-cn-hangzhou',
          ossBucket,
        };

        // Should NOT throw
        try {
          validateConfig(config);
          return true;
        } catch {
          return false;
        }
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 8 (no-throw): validateConfig does not throw when all fields present');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 8 (no-throw): validateConfig incorrectly threw with all fields present');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Property 8 (only-missing): error message should NOT contain variable names
// that are actually present
// ============================================================================

console.log('\n=== Property 8 (only-missing): 错误信息不包含已存在的变量名 ===\n');

try {
  fc.assert(
    fc.property(
      // Generate a non-empty proper subset (not all fields missing)
      fc.subarray(REQUIRED_FIELDS, { minLength: 1, maxLength: REQUIRED_FIELDS.length - 1 }),
      (missingFields) => {
        const config: Partial<VideoProcessorEnvConfig> = { ...VALID_CONFIG };
        const missingFieldNames = new Set(missingFields.map(f => f.field));

        for (const { field } of missingFields) {
          (config as Record<string, string>)[field] = '';
        }

        let errorMessage = '';
        try {
          validateConfig(config);
          return false; // Should have thrown
        } catch (err) {
          errorMessage = err instanceof Error ? err.message : String(err);
        }

        // Present fields should NOT appear in the error message
        for (const { field, envVar } of REQUIRED_FIELDS) {
          if (!missingFieldNames.has(field)) {
            // This field is present — its env var name should NOT be in the error
            if (errorMessage.includes(envVar)) {
              return false;
            }
          }
        }

        return true;
      }
    ),
    { numRuns: 100 }
  );
  testsPassed++;
  console.log('✓ Property 8 (only-missing): error message only contains missing variable names');
} catch (err) {
  testsFailed++;
  console.error('✗ Property 8 (only-missing): error message incorrectly contains present variable names');
  console.error(err instanceof Error ? err.message : String(err));
}

// ============================================================================
// Unit Tests - Specific Examples
// ============================================================================

console.log('\n=== Unit Tests: validateConfig specific examples ===\n');

// All fields present — should not throw
try {
  validateConfig(VALID_CONFIG);
  testsPassed++;
  console.log('✓ Should not throw when all required fields are present');
} catch {
  testsFailed++;
  console.error('✗ Should not throw when all required fields are present');
}

// All fields missing — should throw and list all
try {
  validateConfig({});
  testsFailed++;
  console.error('✗ Should throw when all fields are missing');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  const allPresent = REQUIRED_FIELDS.every(({ envVar }) => msg.includes(envVar));
  assert(allPresent, 'Should list all missing variable names when all are missing');
}

// Single field missing — should throw and list only that one
try {
  const config = { ...VALID_CONFIG, tingwuAppKey: '' };
  validateConfig(config);
  testsFailed++;
  console.error('✗ Should throw when tingwuAppKey is missing');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  assert(
    msg.includes('TINGWU_APP_KEY') && !msg.includes('ALIYUN_ACCESS_KEY_ID'),
    'Should list only TINGWU_APP_KEY when only that field is missing'
  );
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
